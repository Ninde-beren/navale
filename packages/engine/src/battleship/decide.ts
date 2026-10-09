import type { Actor, ColorId, Command, CommandOf, GameEvent, GameEventOf } from '@navale/protocol';
import type { DecideContext, Decision } from '../core/definition.js';
import { ok, reject } from '../core/definition.js';
import { botReadyEvents } from './bot/arrival.js';
import { BOT_NAMES } from './bot/names.js';
import { evolve } from './evolve.js';
import { validateFleet } from './placement.js';
import { computeRanking, isFinishedAfterRound } from './rules/end.js';
import { resolveRound, type ShotToResolve } from './rules/resolve.js';
import { startBlocker } from './rules/start.js';
import { legalTargets } from './rules/targets.js';
import { nextShooters, resolutionOrder } from './rules/turn-order.js';
import {
  inBounds,
  playerById,
  sameCoord,
  type GameState,
  type Player,
  type Round,
} from './state.js';

type BattleshipDecision = Decision<GameEvent>;

/** Commandes réservées à l'hôte. Le serveur s'en sert aussi pour donner son rôle à une connexion. */
export const HOST_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'KICK_PLAYER',
  'ADD_BOT',
  'REMOVE_BOT',
  'START_GAME',
  'FORCE_ROUND',
  'CANCEL_GAME',
  'REMATCH',
]);

/** Commandes d'hôte que le serveur envoie lui-même : chrono de manche, expiration. */
const SYSTEM_COMMANDS: ReadonlySet<Command['type']> = new Set(['FORCE_ROUND', 'CANCEL_GAME']);

function actsAsHost(actor: Actor, command: Command['type']): boolean {
  return actor.kind === 'host' || (actor.kind === 'system' && SYSTEM_COMMANDS.has(command));
}

/** Couleur donnée à un bot : la première libre, dans l'ordre de `COLOR_IDS` du protocole. */
const COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'teal',
  'pink',
] as const satisfies readonly ColorId[];

/** Une fonction par commande. Toute règle de jeu passe par ici. */
export function decide(state: GameState, command: Command, ctx: DecideContext): BattleshipDecision {
  if (HOST_COMMANDS.has(command.type) && !actsAsHost(ctx.actor, command.type))
    return reject('NOT_HOST', 'Réservé à l’hôte de la partie.');
  switch (command.type) {
    case 'JOIN_GAME':
      return joinGame(state, command, ctx);
    case 'LEAVE_GAME':
      return leaveGame(state, ctx);
    case 'UPDATE_PROFILE':
      return updateProfile(state, command, ctx);
    case 'PLACE_FLEET':
      return placeFleet(state, command, ctx);
    case 'SET_READY':
      return setReady(state, command, ctx);
    case 'KICK_PLAYER':
      return kickPlayer(state, command);
    case 'ADD_BOT':
      return addBot(state, ctx);
    case 'REMOVE_BOT':
      return removeBot(state, command);
    case 'START_GAME':
      return startGame(state, ctx);
    case 'FIRE':
      return fire(state, command, ctx);
    case 'FORCE_ROUND':
      return forceRound(state, ctx);
    case 'CANCEL_GAME':
      return cancelGame(state, ctx);
    case 'REMATCH':
      return rematch(state, ctx);
    case 'REQUEST_SNAPSHOT':
      return ok([]);
  }
}

// ---- Aides ---------------------------------------------------------------------

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function nameTaken(state: GameState, name: string, exceptId?: string): boolean {
  return state.players.some((p) => p.playerId !== exceptId && normName(p.name) === normName(name));
}

function colorTaken(state: GameState, color: ColorId, exceptId?: string): boolean {
  return state.players.some((p) => p.playerId !== exceptId && p.color === color);
}

function freeSeat(state: GameState): number {
  const used = new Set(state.players.map((p) => p.seat));
  for (let s = 0; s < state.settings.maxPlayers; s++) if (!used.has(s)) return s;
  return state.players.length;
}

function freeColor(state: GameState): ColorId {
  return COLORS.find((c) => !colorTaken(state, c)) ?? 'red';
}

/** Le dernier humain ne peut pas partir tant qu'il reste des bots. */
function isLastHuman(state: GameState, player: Player): boolean {
  if (player.kind !== 'human') return false;
  const humans = state.players.filter((p) => p.kind === 'human').length;
  const bots = state.players.filter((p) => p.kind === 'bot').length;
  return humans === 1 && bots > 0;
}

function actorPlayer(state: GameState, ctx: DecideContext): Player | BattleshipDecision {
  if (ctx.actor.kind !== 'player')
    return reject('WRONG_STATE', 'Cette commande vient d’un joueur.');
  const p = playerById(state, ctx.actor.playerId);
  return p ?? reject('PLAYER_UNKNOWN', 'Joueur inconnu dans cette partie.');
}

function isDecision(x: Player | BattleshipDecision): x is BattleshipDecision {
  return 'ok' in x;
}

function roundStarted(state: GameState, index: number, now: number): GameEventOf<'ROUND_STARTED'> {
  const timer = state.settings.roundTimerSeconds;
  return {
    type: 'ROUND_STARTED',
    round: index,
    expectedShooters: nextShooters(state),
    startedAt: now,
    deadline: timer === null ? null : now + timer * 1000,
  };
}

/** Les tirs engagés de la manche, dans l'ordre où ils seront résolus. */
function committedShots(state: GameState, round: Round): ShotToResolve[] {
  return resolutionOrder(state, round.index, Object.keys(round.committed)).map((shooterId) => ({
    shooterId,
    ...round.committed[shooterId]!,
  }));
}

/**
 * Résout les tirs d'une manche, prononce les éliminations, clôt la manche,
 * puis ouvre la suivante ou termine la partie. Le serveur espace la
 * publication de ces événements (ADR-006), le moteur les produit d'un coup.
 */
function resolveAndAdvance(
  state: GameState,
  shots: ShotToResolve[],
  skipped: string[],
  ctx: DecideContext,
): GameEvent[] {
  const roundIndex = state.round?.index ?? 0;
  const { resolved, eliminated } = resolveRound(state, shots);
  const events: GameEvent[] = resolved.map((r) => ({ type: 'SHOT_RESOLVED', ...r }));
  for (const e of eliminated)
    events.push({
      type: 'PLAYER_ELIMINATED',
      playerId: e.playerId,
      round: roundIndex,
      rank: e.rank,
    });
  events.push({ type: 'ROUND_RESOLVED', round: roundIndex, skipped });

  let next = state;
  for (const e of events) next = evolve(next, e);

  if (isFinishedAfterRound(next, eliminated.length)) {
    const ranking = computeRanking(next);
    const firsts = ranking.filter((r) => r.rank === 1);
    events.push({
      type: 'GAME_FINISHED',
      ranking,
      winnerId: firsts.length === 1 ? firsts[0]!.playerId : null,
      finishedAt: ctx.now,
    });
  } else {
    events.push(roundStarted(next, roundIndex + 1, ctx.now));
  }
  return events;
}

// ---- Lobby ---------------------------------------------------------------------

function joinGame(
  state: GameState,
  command: CommandOf<'JOIN_GAME'>,
  ctx: DecideContext,
): BattleshipDecision {
  if (ctx.actor.kind === 'player') return reject('WRONG_STATE', 'Tu es déjà dans la partie.');
  if (ctx.actor.kind !== 'join')
    return reject('WRONG_STATE', 'Seule une nouvelle connexion peut rejoindre.');
  if (state.status !== 'LOBBY') return reject('GAME_NOT_JOINABLE', 'La partie a déjà commencé.');
  if (state.players.length >= state.settings.maxPlayers)
    return reject('GAME_FULL', 'La partie est pleine.');
  const name = command.name.trim();
  if (nameTaken(state, name)) return reject('NAME_TAKEN', `Le pseudo « ${name} » est déjà pris.`);
  if (colorTaken(state, command.color))
    return reject('COLOR_TAKEN', 'Cette couleur est déjà prise.');
  return ok([
    {
      type: 'PLAYER_JOINED',
      playerId: ctx.newId(),
      name,
      color: command.color,
      seat: freeSeat(state),
      kind: 'human',
    },
  ]);
}

function leaveGame(state: GameState, ctx: DecideContext): BattleshipDecision {
  const me = actorPlayer(state, ctx);
  if (isDecision(me)) return me;
  if (state.status !== 'LOBBY')
    return reject('WRONG_STATE', 'On ne quitte pas une partie en cours.');
  if (isLastHuman(state, me))
    return reject('LAST_HUMAN', 'Il faut au moins un humain : annule plutôt la partie.');
  return ok([{ type: 'PLAYER_LEFT', playerId: me.playerId }]);
}

function updateProfile(
  state: GameState,
  command: CommandOf<'UPDATE_PROFILE'>,
  ctx: DecideContext,
): BattleshipDecision {
  const me = actorPlayer(state, ctx);
  if (isDecision(me)) return me;
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'Le profil se change au lobby.');
  const name = command.name?.trim() ?? me.name;
  const color = command.color ?? me.color;
  if (nameTaken(state, name, me.playerId))
    return reject('NAME_TAKEN', `Le pseudo « ${name} » est déjà pris.`);
  if (colorTaken(state, color, me.playerId))
    return reject('COLOR_TAKEN', 'Cette couleur est déjà prise.');
  if (name === me.name && color === me.color) return ok([]);
  return ok([{ type: 'PLAYER_PROFILE_UPDATED', playerId: me.playerId, name, color }]);
}

function placeFleet(
  state: GameState,
  command: CommandOf<'PLACE_FLEET'>,
  ctx: DecideContext,
): BattleshipDecision {
  const me = actorPlayer(state, ctx);
  if (isDecision(me)) return me;
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'La flotte se place au lobby.');
  if (me.status !== 'PLACING')
    return reject('WRONG_STATE', 'Repasse en placement avant de modifier ta flotte.');
  const fleet = validateFleet(state.settings, command.ships);
  if (!fleet.ok) return reject('FLEET_INVALID', 'Flotte invalide.', fleet.errors);
  return ok([{ type: 'FLEET_PLACED', playerId: me.playerId, ships: fleet.ships }]);
}

function setReady(
  state: GameState,
  command: CommandOf<'SET_READY'>,
  ctx: DecideContext,
): BattleshipDecision {
  const me = actorPlayer(state, ctx);
  if (isDecision(me)) return me;
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'La partie a déjà commencé.');
  if (command.ready && me.fleet.length === 0)
    return reject('FLEET_MISSING', 'Place ta flotte avant de te déclarer prêt.');
  const already = command.ready ? me.status === 'READY' : me.status === 'PLACING';
  if (already) return ok([]);
  return ok([{ type: 'PLAYER_READY_CHANGED', playerId: me.playerId, ready: command.ready }]);
}

function kickPlayer(state: GameState, command: CommandOf<'KICK_PLAYER'>): BattleshipDecision {
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'On n’exclut qu’au lobby.');
  const target = playerById(state, command.playerId);
  if (!target) return reject('PLAYER_UNKNOWN', 'Joueur inconnu dans cette partie.');
  if (isLastHuman(state, target))
    return reject('LAST_HUMAN', 'Il faut au moins un humain : annule plutôt la partie.');
  return ok([{ type: 'PLAYER_KICKED', playerId: target.playerId }]);
}

function addBot(state: GameState, ctx: DecideContext): BattleshipDecision {
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'Les bots s’ajoutent au lobby.');
  if (state.players.length >= state.settings.maxPlayers)
    return reject('GAME_FULL', 'La partie est pleine.');
  const bots = state.players.filter((p) => p.kind === 'bot').length;
  if (bots >= state.settings.maxPlayers - 1)
    return reject('GAME_FULL', 'Il faut garder une place pour un humain.');
  const name = BOT_NAMES.find((n) => !nameTaken(state, n)) ?? `Bot ${bots + 1}`;
  const playerId = ctx.newId();
  return ok([
    {
      type: 'PLAYER_JOINED',
      playerId,
      name,
      color: freeColor(state),
      seat: freeSeat(state),
      kind: 'bot',
    },
    ...botReadyEvents(state.settings, playerId, ctx.random),
  ]);
}

function removeBot(state: GameState, command: CommandOf<'REMOVE_BOT'>): BattleshipDecision {
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'Les bots se retirent au lobby.');
  const target = playerById(state, command.playerId);
  if (!target) return reject('PLAYER_UNKNOWN', 'Joueur inconnu dans cette partie.');
  if (target.kind !== 'bot') return reject('NOT_A_BOT', 'Ce joueur n’est pas un bot.');
  return ok([{ type: 'PLAYER_LEFT', playerId: target.playerId }]);
}

function startGame(state: GameState, ctx: DecideContext): BattleshipDecision {
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'La partie a déjà commencé.');
  switch (startBlocker(state)) {
    case 'NOT_ENOUGH_PLAYERS':
      return reject('NOT_ENOUGH_PLAYERS', 'Il faut au moins deux joueurs.');
    case 'NO_HUMAN':
      return reject('NOT_ENOUGH_PLAYERS', 'Il faut au moins un humain.');
    case 'PLAYERS_NOT_READY': {
      const notReady = state.players.filter((p) => p.status !== 'READY').map((p) => p.playerId);
      return reject('PLAYERS_NOT_READY', 'Tout le monde n’est pas prêt.', { players: notReady });
    }
  }
  const started: GameEvent = {
    type: 'GAME_STARTED',
    settings: state.settings,
    seats: [...state.players].sort((a, b) => a.seat - b.seat).map((p) => p.playerId),
    startedAt: ctx.now,
  };
  const next = evolve(state, started);
  return ok([started, roundStarted(next, 0, ctx.now)]);
}

// ---- Partie ---------------------------------------------------------------------

function fire(
  state: GameState,
  command: CommandOf<'FIRE'>,
  ctx: DecideContext,
): BattleshipDecision {
  const me = actorPlayer(state, ctx);
  if (isDecision(me)) return me;
  if (state.status !== 'PLAYING' || !state.round)
    return reject('GAME_NOT_PLAYING', 'La partie n’est pas en cours.');
  if (me.status !== 'ALIVE') return reject('NOT_ALIVE', 'Tu es éliminé.');
  const round = state.round;
  if (!round.expectedShooters.includes(me.playerId))
    return reject('NOT_YOUR_TURN', 'Ce n’est pas ton tour.');
  if (round.committed[me.playerId])
    return reject('ALREADY_COMMITTED', 'Tu as déjà tiré dans cette manche.');
  if (command.targetId === me.playerId)
    return reject('TARGET_IS_SELF', 'On ne se tire pas dessus.');
  const target = playerById(state, command.targetId);
  if (!target || target.status !== 'ALIVE')
    return reject('TARGET_NOT_ALIVE', 'Cette cible n’est plus en jeu.');
  if (!legalTargets(state, me.playerId).includes(target.playerId))
    return reject('TARGET_NOT_LEGAL', 'Cette cible n’est pas autorisée.');
  if (!inBounds(state.settings, command.coord))
    return reject('COORD_OUT_OF_BOUNDS', 'Case hors de la grille.');
  if (target.shotsReceived.some((s) => sameCoord(s.coord, command.coord)))
    return reject('CELL_ALREADY_SHOT', 'Cette case est déjà révélée.');

  const shot: ShotToResolve = {
    shooterId: me.playerId,
    targetId: target.playerId,
    coord: command.coord,
  };
  if (state.settings.variant === 'sequential') return ok(resolveAndAdvance(state, [shot], [], ctx));

  const committed: GameEvent = {
    type: 'SHOT_COMMITTED',
    round: round.index,
    shooterId: me.playerId,
    targetId: target.playerId,
    coord: command.coord,
  };
  // Salve : le tir attend les autres ; le dernier engagé déclenche la résolution.
  const next = evolve(state, committed);
  const nextRound = next.round ?? round;
  if (Object.keys(nextRound.committed).length < round.expectedShooters.length)
    return ok([committed]);
  return ok([committed, ...resolveAndAdvance(next, committedShots(next, nextRound), [], ctx)]);
}

function forceRound(state: GameState, ctx: DecideContext): BattleshipDecision {
  if (state.status !== 'PLAYING' || !state.round)
    return reject('GAME_NOT_PLAYING', 'La partie n’est pas en cours.');
  const round = state.round;
  const skipped = round.expectedShooters.filter((id) => !round.committed[id]);
  return ok(resolveAndAdvance(state, committedShots(state, round), skipped, ctx));
}

/**
 * La revanche : le moteur décide (hôte, partie terminée, une seule fois) et
 * nomme la nouvelle partie ; le serveur l'ouvre avec `rematchEvents`.
 */
function rematch(state: GameState, ctx: DecideContext): BattleshipDecision {
  if (state.status !== 'FINISHED')
    return reject('WRONG_STATE', 'La revanche se lance sur une partie terminée.');
  if (state.rematchGameId !== null) return reject('WRONG_STATE', 'La revanche est déjà lancée.');
  return ok([{ type: 'REMATCH_CREATED', newGameId: ctx.newId(), code: state.code }]);
}

function cancelGame(state: GameState, ctx: DecideContext): BattleshipDecision {
  if (state.status !== 'LOBBY' && state.status !== 'PLAYING')
    return reject('WRONG_STATE', 'La partie est déjà terminée.');
  return ok([{ type: 'GAME_CANCELLED', reason: ctx.actor.kind === 'system' ? 'expired' : 'host' }]);
}
