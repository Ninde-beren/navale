import type {
  BoardView,
  GameEvent,
  PlayerView,
  PublicPlayer,
  PublicRound,
  VisibleEvent,
} from '@navale/protocol';
import type { Presence } from '../core/definition.js';
import { startBlocker } from './rules/start.js';
import { antiFocusBlocked, legalTargets } from './rules/targets.js';
import {
  cellsRemaining,
  isSunk,
  playerById,
  shipsRemaining,
  sunkInfo,
  type GameState,
  type Player,
} from './state.js';

/*
 * La frontière public / privé est ici et nulle part ailleurs : les vues de l'état
 * (`projectPublic`, `projectPrivate`) et celles des événements (`publicEvent`,
 * `privateRecipient`). `projectPublic` ne lit `player.fleet` que pour compter les
 * bateaux et décrire les coulés.
 */

function publicPlayer(state: GameState, p: Player, presence: Presence): PublicPlayer {
  return {
    playerId: p.playerId,
    name: p.name,
    color: p.color,
    seat: p.seat,
    kind: p.kind,
    ...(p.level ? { level: p.level } : {}),
    status: p.status,
    connected: p.kind === 'bot' ? true : (presence[p.playerId] ?? false),
    substitute: p.substitute,
    shipsRemaining: shipsRemaining(p),
    revealed: p.shotsReceived.map((s) => ({ coord: s.coord, result: s.result })),
    sunkShips: p.fleet.filter(isSunk).map((ship) => sunkInfo(state.settings, ship)),
    rank: p.rank,
  };
}

function publicRound(state: GameState): PublicRound | null {
  const r = state.round;
  if (!r) return null;
  return {
    index: r.index,
    expectedShooters: [...r.expectedShooters],
    committed: Object.keys(r.committed),
    activePlayerId:
      state.settings.variant === 'sequential' ? (r.expectedShooters[0] ?? null) : null,
    deadline: r.deadline,
  };
}

function lastShots(state: GameState) {
  const last = state.shotsLog[state.shotsLog.length - 1];
  return last ? state.shotsLog.filter((s) => s.round === last.round) : [];
}

export function projectPublic(state: GameState, presence: Presence = {}): BoardView {
  return {
    kind: 'board',
    gameId: state.gameId,
    code: state.code,
    status: state.status,
    settings: state.settings,
    players: state.players.map((p) => publicPlayer(state, p, presence)),
    round: publicRound(state),
    startBlocker: startBlocker(state),
    lastShots: lastShots(state),
    ranking: state.ranking,
    isHost: false,
    seq: state.seq,
  };
}

export function projectPrivate(
  state: GameState,
  playerId: string,
  presence: Presence = {},
): PlayerView {
  const me = playerById(state, playerId);
  if (!me) throw new Error(`projectPrivate : joueur inconnu ${playerId}`);
  const { kind: _kind, ...board } = projectPublic(state, presence);
  const round = state.round;
  const expected = round?.expectedShooters.includes(playerId) ?? false;
  const pending = round?.committed[playerId] ?? null;
  return {
    ...board,
    kind: 'player',
    me: {
      playerId,
      fleet: me.fleet,
      cellsRemaining: cellsRemaining(me),
      legalTargets: state.status === 'PLAYING' ? legalTargets(state, playerId) : [],
      antiFocusBlocked: state.status === 'PLAYING' ? antiFocusBlocked(state, playerId) : null,
      pendingShot: pending,
      shotsFired: state.shotsLog.filter((s) => s.shooterId === playerId),
      canFire: state.status === 'PLAYING' && me.status === 'ALIVE' && expected && pending === null,
    },
  };
}

/** Ce que l'écran central et les autres joueurs voient d'un événement : sans ses champs privés. */
export function publicEvent(event: GameEvent): VisibleEvent {
  switch (event.type) {
    case 'FLEET_PLACED': {
      const { ships: _ships, ...placed } = event;
      return placed;
    }
    case 'SHOT_COMMITTED': {
      const { targetId: _targetId, coord: _coord, ...committed } = event;
      return committed;
    }
    default:
      return event;
  }
}

/** Le seul joueur qui reçoit l'événement complet, quand il a une part privée. */
export function privateRecipient(event: GameEvent): string | null {
  switch (event.type) {
    case 'FLEET_PLACED':
      return event.playerId;
    case 'SHOT_COMMITTED':
      return event.shooterId;
    default:
      return null;
  }
}
