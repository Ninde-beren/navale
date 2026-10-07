import type { BoardView, PlayerView, PublicPlayer, PublicRound } from '@navale/protocol';
import type { Presence } from '../core/definition.js';
import { legalTargets } from './rules/targets.js';
import { cellsRemaining, isSunk, shipsRemaining, type GameState, type Player } from './state.js';

/**
 * La frontière public / privé est ici et nulle part ailleurs. `projectPublic`
 * ne lit `player.fleet` que pour compter les bateaux et décrire les coulés.
 */
function publicPlayer(state: GameState, p: Player, presence: Presence): PublicPlayer {
  const classic = state.settings.sunkReveal === 'classic';
  return {
    playerId: p.playerId,
    name: p.name,
    color: p.color,
    seat: p.seat,
    kind: p.kind,
    status: p.status,
    connected: p.kind === 'bot' ? true : (presence[p.playerId] ?? false),
    shipsRemaining: shipsRemaining(p),
    revealed: p.shotsReceived.map((s) => ({ coord: s.coord, result: s.result })),
    sunkShips: p.fleet
      .filter(isSunk)
      .map((s) =>
        classic
          ? { shipId: s.shipId, size: s.size, cells: s.cells }
          : { shipId: s.shipId, size: s.size },
      ),
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
  const me = state.players.find((p) => p.playerId === playerId);
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
      pendingShot: pending,
      shotsFired: state.shotsLog.filter((s) => s.shooterId === playerId),
      canFire: state.status === 'PLAYING' && me.status === 'ALIVE' && expected && pending === null,
    },
  };
}
