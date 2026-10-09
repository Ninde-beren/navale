import type { Coord, ResolvedShot, Ship } from '@navale/protocol';
import type { GameState, Player } from '../state.js';
import { cellsRemaining, isSunk, playerById, sameCoord, sunkInfo } from '../state.js';
import { tiedRanks } from './ranks.js';

export interface ShotToResolve {
  shooterId: string;
  targetId: string;
  coord: Coord;
}

export interface RoundResolution {
  resolved: ResolvedShot[];
  eliminated: Array<{ playerId: string; rank: number }>;
}

/**
 * Résout les tirs d'une manche, dans l'ordre donné, contre l'état de début de
 * manche : deux tirs sur la même case obtiennent le même résultat ; le `SUNK`
 * est crédité au premier tireur qui complète le bateau. Les éliminations sont
 * calculées après le dernier tir, et les joueurs éliminés dans la même manche
 * sont classés aux cases restantes avant la manche.
 */
export function resolveRound(state: GameState, shots: ShotToResolve[]): RoundResolution {
  const round = state.round?.index ?? 0;
  const working = new Map<string, Ship[]>();
  const fleetOf = (p: Player) => {
    let f = working.get(p.playerId);
    if (!f) {
      f = p.fleet.map((s) => ({ ...s, hits: [...s.hits] }));
      working.set(p.playerId, f);
    }
    return f;
  };

  const resolved: ResolvedShot[] = [];
  for (const shot of shots) {
    const target = playerById(state, shot.targetId);
    if (!target) continue;
    const fleet = fleetOf(target);
    const ship = fleet.find((s) => s.cells.some((c) => sameCoord(c, shot.coord)));
    if (!ship) {
      resolved.push({
        round,
        shooterId: shot.shooterId,
        targetId: shot.targetId,
        coord: shot.coord,
        result: 'MISS',
      });
      continue;
    }
    const alreadyHit = ship.hits.some((c) => sameCoord(c, shot.coord));
    if (!alreadyHit) ship.hits.push(shot.coord);
    const completes = !alreadyHit && ship.hits.length === ship.size;
    const entry: ResolvedShot = {
      round,
      shooterId: shot.shooterId,
      targetId: shot.targetId,
      coord: shot.coord,
      result: completes ? 'SUNK' : 'HIT',
    };
    if (completes) entry.sunk = sunkInfo(state.settings, ship);
    resolved.push(entry);
  }

  const dead = state.players.filter(
    (p) => p.status === 'ALIVE' && working.has(p.playerId) && fleetOf(p).every(isSunk),
  );
  const aliveAfter = state.players.filter((p) => p.status === 'ALIVE').length - dead.length;
  // Même manche : classement aux cases restantes avant la manche, égalité possible.
  const sorted = [...dead].sort((a, b) => cellsRemaining(b) - cellsRemaining(a));
  const ranks = tiedRanks(
    sorted,
    (a, b) => cellsRemaining(a) === cellsRemaining(b),
    aliveAfter + 1,
  );
  const eliminated = sorted.map((p, i) => ({ playerId: p.playerId, rank: ranks[i]! }));
  return { resolved, eliminated };
}
