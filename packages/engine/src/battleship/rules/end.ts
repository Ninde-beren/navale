import type { RankEntry } from '@navale/protocol';
import type { GameState, Player } from '../state.js';
import { alivePlayers, cellsRemaining, shipsRemaining } from '../state.js';
import { tiedRanks } from './ranks.js';

/** Condition de fin, évaluée après chaque manche résolue. */
export function isFinishedAfterRound(state: GameState, eliminatedThisRound: number): boolean {
  if (state.settings.endCondition === 'first_fleet_sunk') return eliminatedThisRound > 0;
  return alivePlayers(state).length <= 1;
}

export function statsOf(state: GameState, p: Player): Omit<RankEntry, 'rank'> {
  const mine = state.shotsLog.filter((s) => s.shooterId === p.playerId);
  const hits = mine.filter((s) => s.result === 'HIT' || s.result === 'SUNK').length;
  const fleetSize = state.settings.fleet.length;
  const sunkByTarget = new Map<string, number>();
  let playersEliminated = 0;
  for (const s of state.shotsLog) {
    if (s.result !== 'SUNK') continue;
    const n = (sunkByTarget.get(s.targetId) ?? 0) + 1;
    sunkByTarget.set(s.targetId, n);
    if (n === fleetSize && s.shooterId === p.playerId) playersEliminated++;
  }
  return {
    playerId: p.playerId,
    shotsFired: mine.length,
    hits,
    accuracy: mine.length === 0 ? 0 : Math.round((hits / mine.length) * 1000) / 1000,
    shipsSunk: mine.filter((s) => s.result === 'SUNK').length,
    playersEliminated,
    cellsRemaining: cellsRemaining(p),
  };
}

/**
 * Classement final : les vivants d'abord (cases restantes, puis bateaux
 * restants, puis touches infligées), puis les éliminés à leur rang.
 */
export function computeRanking(state: GameState): RankEntry[] {
  const alive = alivePlayers(state);
  const stats = new Map(state.players.map((p) => [p.playerId, statsOf(state, p)] as const));
  const cmp = (a: Player, b: Player) =>
    cellsRemaining(b) - cellsRemaining(a) ||
    shipsRemaining(b) - shipsRemaining(a) ||
    stats.get(b.playerId)!.hits - stats.get(a.playerId)!.hits;
  const sortedAlive = [...alive].sort(cmp);
  const ranks = tiedRanks(sortedAlive, (a, b) => cmp(a, b) === 0);
  const entries: RankEntry[] = sortedAlive.map((p, i) => ({
    ...stats.get(p.playerId)!,
    rank: ranks[i]!,
  }));
  const eliminated = state.players
    .filter((p) => p.status === 'ELIMINATED')
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.seat - a.seat);
  for (const p of eliminated)
    entries.push({ ...stats.get(p.playerId)!, rank: p.rank ?? alive.length + 1 });
  return entries;
}
