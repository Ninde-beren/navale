import type {
  Actor,
  ColorId,
  Command,
  CommandOf,
  GameEvent,
  GameEventOf,
  PendingShot,
} from '@navale/protocol';
import type { DecideContext, Decision } from '../core/definition.js';
import { ok, reject } from '../core/definition.js';
import { botReadyEvents } from './bot/arrival.js';
import { BOT_NAMES } from './bot/names.js';
import { pick } from '../core/random.js';
import { evolve } from './evolve.js';
import { validateFleet } from './placement.js';
import {
  SELF_ABILITIES,
  abilityEffects,
  decoyCells,
  missileStrikes,
  repairableCells,
  shieldCovers,
} from './rules/abilities.js';
import { computeRanking, isFinishedAfterRound } from './rules/end.js';
import { resolveRound, type ShotToResolve } from './rules/resolve.js';
import { startBlocker } from './rules/start.js';
import { antiFocusBlocked, legalTargets } from './rules/targets.js';
import { nextShooters, resolutionOrder } from './rules/turn-order.js';
import {
  commanderOf,
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
  'SUBSTITUTE_PLAYER',
  'RESUME_PLAYER',
  'CANCEL_GAME',
  'REMATCH',
]);

/** Commandes d'hôte que le serveur envoie lui-même : chrono de manche, joueur absent, expiration. */
const SYSTEM_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'FORCE_ROUND',
  'SUBSTITUTE_PLAYER',
  'RESUME_PLAYER',
  'CANCEL_GAME',
]);

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
    case 'CHOOSE_COMMANDER':
      return chooseCommander(state, command, ctx);
    case 'KICK_PLAYER':
      return kickPlayer(state, command);
    case 'ADD_BOT':
      return addBot(state, command, ctx);
    case 'REMOVE_BOT':
      return removeBot(state, command);
    case 'START_GAME':
      return startGame(state, ctx);
    case 'FIRE':
      return fire(state, command, ctx);
    case 'USE_ABILITY':
      return useAbility(state, command, ctx);
    case 'FORCE_ROUND':
      return forceRound(state, ctx);
    case 'SUBSTITUTE_PLAYER':
      return substitutePlayer(state, command);
    case 'RESUME_PLAYER':
      return resumePlayer(state, command);
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

/**
 * Résout les tirs d'une manche, prononce les éliminations, clôt la manche,
 * puis ouvre la suivante ou termine la partie. Le serveur espace la
 * publication de ces événements au rythme de l'écran central, le moteur les produit d'un coup.
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

/**
 * Résout une manche de salve : les capacités engagées d'abord (leur usage et leur
 * effet, dans l'ordre de résolution, chacun appliqué avant le suivant), puis tous
 * les tirs, ceux des missiles compris, contre l'état ainsi obtenu.
 */
function resolveCommitted(
  state: GameState,
  round: Round,
  skipped: string[],
  ctx: DecideContext,
): GameEvent[] {
  let next = state;
  const prelude: GameEvent[] = [];
  const shots: ShotToResolve[] = [];
  for (const shooterId of resolutionOrder(state, round.index, Object.keys(round.committed))) {
    const pending = round.committed[shooterId]!;
    const shooter = playerById(next, shooterId);
    const commander = shooter && commanderOf(next, shooter);
    if (!pending.ability || !commander) {
      shots.push({ shooterId, targetId: pending.targetId, coord: pending.coord });
      continue;
    }
    const effects = abilityEffects(next, commander.ability, shooterId, pending, ctx);
    for (const e of effects.events) {
      prelude.push(e);
      next = evolve(next, e);
    }
    shots.push(...effects.shots);
  }
  return [...prelude, ...resolveAndAdvance(next, shots, skipped, ctx)];
}

/** Salve : l'action attend les autres ; la dernière engagée déclenche la résolution. */
function commitAction(
  state: GameState,
  round: Round,
  shooterId: string,
  pending: PendingShot,
  ctx: DecideContext,
): BattleshipDecision {
  const committed: GameEvent = {
    type: 'SHOT_COMMITTED',
    round: round.index,
    shooterId,
    targetId: pending.targetId,
    coord: pending.coord,
    ...(pending.ability ? { ability: pending.ability } : {}),
  };
  const next = evolve(state, committed);
  const nextRound = next.round ?? round;
  if (Object.keys(nextRound.committed).length < round.expectedShooters.length)
    return ok([committed]);
  return ok([committed, ...resolveCommitted(next, nextRound, [], ctx)]);
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
  if (
    command.ready &&
    state.settings.commanders.length > 0 &&
    me.kind === 'human' &&
    me.commanderId === null
  )
    return reject('COMMANDER_MISSING', 'Choisis un commandant avant de te déclarer prêt.');
  const already = command.ready ? me.status === 'READY' : me.status === 'PLACING';
  if (already) return ok([]);
  return ok([{ type: 'PLAYER_READY_CHANGED', playerId: me.playerId, ready: command.ready }]);
}

/** Le commandant se choisit au lobby, parmi ceux que la partie propose ; un bot n'en a pas. */
function chooseCommander(
  state: GameState,
  command: CommandOf<'CHOOSE_COMMANDER'>,
  ctx: DecideContext,
): BattleshipDecision {
  const me = actorPlayer(state, ctx);
  if (isDecision(me)) return me;
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'Le commandant se choisit au lobby.');
  if (state.settings.commanders.length === 0)
    return reject('WRONG_STATE', 'Cette partie se joue sans commandants.');
  const commander = state.settings.commanders.find((c) => c.id === command.commanderId);
  if (!commander)
    return reject('COMMANDER_UNKNOWN', 'Ce commandant n’existe pas dans cette partie.');
  if (me.commanderId === commander.id) return ok([]);
  return ok([{ type: 'COMMANDER_CHOSEN', playerId: me.playerId, commanderId: commander.id }]);
}

function kickPlayer(state: GameState, command: CommandOf<'KICK_PLAYER'>): BattleshipDecision {
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'On n’exclut qu’au lobby.');
  const target = playerById(state, command.playerId);
  if (!target) return reject('PLAYER_UNKNOWN', 'Joueur inconnu dans cette partie.');
  if (isLastHuman(state, target))
    return reject('LAST_HUMAN', 'Il faut au moins un humain : annule plutôt la partie.');
  return ok([{ type: 'PLAYER_KICKED', playerId: target.playerId }]);
}

function addBot(
  state: GameState,
  command: CommandOf<'ADD_BOT'>,
  ctx: DecideContext,
): BattleshipDecision {
  if (state.status !== 'LOBBY') return reject('WRONG_STATE', 'Les bots s’ajoutent au lobby.');
  if (state.players.length >= state.settings.maxPlayers)
    return reject('GAME_FULL', 'La partie est pleine.');
  const bots = state.players.filter((p) => p.kind === 'bot').length;
  if (bots >= state.settings.maxPlayers - 1)
    return reject('GAME_FULL', 'Il faut garder une place pour un humain.');
  const name = BOT_NAMES.find((n) => !nameTaken(state, n)) ?? `Bot ${bots + 1}`;
  const playerId = ctx.newId();
  // Partie avec commandants : le bot en tire un au hasard, et jouera sa capacité.
  const commanders = state.settings.commanders;
  return ok([
    {
      type: 'PLAYER_JOINED',
      playerId,
      name,
      color: freeColor(state),
      seat: freeSeat(state),
      kind: 'bot',
      level: command.level ?? 'normal',
    },
    ...botReadyEvents(state.settings, playerId, ctx.random),
    ...(commanders.length > 0
      ? [
          {
            type: 'COMMANDER_CHOSEN',
            playerId,
            commanderId: pick(ctx.random, commanders).id,
          } as const,
        ]
      : []),
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
  if (!legalTargets(state, me.playerId).includes(target.playerId)) {
    const max = state.settings.antiFocusMaxStreak ?? 0;
    return antiFocusBlocked(state, me.playerId) === target.playerId
      ? reject(
          'TARGET_NOT_LEGAL',
          `Pas plus de ${max} tir${max > 1 ? 's' : ''} de suite sur le même joueur : vise quelqu’un d’autre.`,
        )
      : reject('TARGET_NOT_LEGAL', 'Cette cible n’est pas autorisée.');
  }
  if (!inBounds(state.settings, command.coord))
    return reject('COORD_OUT_OF_BOUNDS', 'Case hors de la grille.');
  if (target.shotsReceived.some((s) => sameCoord(s.coord, command.coord)))
    return reject('CELL_ALREADY_SHOT', 'Cette case est déjà révélée.');
  if (shieldCovers(target.shield, command.coord))
    return reject(
      'CELL_SHIELDED',
      `Case protégée par le bouclier de ${target.name} jusqu’à son prochain tour.`,
    );

  const shot: ShotToResolve = {
    shooterId: me.playerId,
    targetId: target.playerId,
    coord: command.coord,
  };
  if (state.settings.variant === 'sequential') return ok(resolveAndAdvance(state, [shot], [], ctx));
  return commitAction(state, round, me.playerId, shot, ctx);
}

/**
 * La capacité de mon commandant, à la place de mon tir : mêmes conditions de tour
 * qu'un tir, un usage restant, puis selon la capacité : la réparation vise ma propre
 * flotte sur une case touchée d'un bateau à flot ; le missile vise une cible légale
 * (c'est un tir, l'anti-acharnement s'applique) ; le radar vise n'importe quel vivant.
 */
function useAbility(
  state: GameState,
  command: CommandOf<'USE_ABILITY'>,
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
    return reject('ALREADY_COMMITTED', 'Tu as déjà joué dans cette manche.');
  const commander = commanderOf(state, me);
  if (!commander || me.abilityUsesLeft <= 0)
    return reject('ABILITY_UNAVAILABLE', 'Tu n’as plus de capacité à jouer.');
  const { ability } = commander;
  if (SELF_ABILITIES.has(ability.type)) {
    if (command.targetId !== me.playerId)
      return reject('WRONG_STATE', 'Cette capacité se joue sur ta propre flotte.');
    if (!inBounds(state.settings, command.coord))
      return reject('COORD_OUT_OF_BOUNDS', 'Case hors de la grille.');
    if (
      ability.type === 'repair' &&
      !repairableCells(me.fleet).some((c) => sameCoord(c, command.coord))
    )
      return reject(
        'CELL_NOT_REPAIRABLE',
        'Seule une case touchée d’un bateau encore à flot se répare.',
      );
    if (
      ability.type === 'decoy' &&
      !decoyCells(state.settings, me.fleet, me.shotsReceived, me.decoys).some((c) =>
        sameCoord(c, command.coord),
      )
    )
      return reject('CELL_NOT_FREE', 'Le leurre se pose sur une case vide, encore jamais visée.');
  } else {
    if (command.targetId === me.playerId)
      return reject('TARGET_IS_SELF', 'On ne se vise pas soi-même.');
    const target = playerById(state, command.targetId);
    if (!target || target.status !== 'ALIVE')
      return reject('TARGET_NOT_ALIVE', 'Cette cible n’est plus en jeu.');
    if (ability.type === 'missile' && !legalTargets(state, me.playerId).includes(target.playerId))
      return reject('TARGET_NOT_LEGAL', 'Cette cible n’est pas autorisée.');
    if (!inBounds(state.settings, command.coord))
      return reject('COORD_OUT_OF_BOUNDS', 'Case hors de la grille.');
    if (
      ability.type === 'missile' &&
      missileStrikes(state.settings, command.coord, target.shotsReceived, target.shield).length ===
        0
    )
      return reject(
        'CELL_ALREADY_SHOT',
        'Toutes les cases de la rafale sont déjà révélées ou protégées.',
      );
  }
  const pending: PendingShot = {
    targetId: command.targetId,
    coord: command.coord,
    ability: ability.type,
  };
  if (state.settings.variant !== 'sequential')
    return commitAction(state, round, me.playerId, pending, ctx);
  const effects = abilityEffects(state, ability, me.playerId, pending, ctx);
  let next = state;
  for (const e of effects.events) next = evolve(next, e);
  return ok([...effects.events, ...resolveAndAdvance(next, effects.shots, [], ctx)]);
}

function forceRound(state: GameState, ctx: DecideContext): BattleshipDecision {
  if (state.status !== 'PLAYING' || !state.round)
    return reject('GAME_NOT_PLAYING', 'La partie n’est pas en cours.');
  const round = state.round;
  const skipped = round.expectedShooters.filter((id) => !round.committed[id]);
  return ok(resolveCommitted(state, round, skipped, ctx));
}

/**
 * Joueur absent : un bot tire pour un humain encore en jeu, au niveau fixé par les
 * réglages, sans créer de joueur ; sa flotte, son siège et son classement restent les siens.
 * Le serveur décide du moment (déconnecté depuis `afkBotSeconds` alors qu'on l'attend).
 */
function substitutePlayer(
  state: GameState,
  command: CommandOf<'SUBSTITUTE_PLAYER'>,
): BattleshipDecision {
  if (state.status !== 'PLAYING')
    return reject('GAME_NOT_PLAYING', 'La partie n’est pas en cours.');
  const target = playerById(state, command.playerId);
  if (!target) return reject('PLAYER_UNKNOWN', 'Joueur inconnu dans cette partie.');
  if (target.kind !== 'human') return reject('WRONG_STATE', 'Un bot ne se remplace pas.');
  if (target.status !== 'ALIVE') return reject('NOT_ALIVE', 'Ce joueur est éliminé.');
  if (target.substitute !== null) return ok([]);
  return ok([
    { type: 'PLAYER_SUBSTITUTED', playerId: target.playerId, level: state.settings.afkBotLevel },
  ]);
}

/** Le joueur est revenu : il reprend la main ; sans relais en cours, rien à faire. */
function resumePlayer(state: GameState, command: CommandOf<'RESUME_PLAYER'>): BattleshipDecision {
  const target = playerById(state, command.playerId);
  if (!target) return reject('PLAYER_UNKNOWN', 'Joueur inconnu dans cette partie.');
  if (target.substitute === null) return ok([]);
  return ok([{ type: 'PLAYER_RESUMED', playerId: target.playerId }]);
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
