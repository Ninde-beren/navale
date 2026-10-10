import type { Coord, ResolvedShot, Ship } from '@navale/protocol';
import type { GameState, Player } from '../state.js';
import { cellsRemaining, isSunk, playerById, sameCoord, sunkInfo } from '../state.js';
import { shieldCovers } from './abilities.js';
import { tiedRanks } from './ranks.js';

export interface ShotToResolve {
  shooterId: string;
  targetId: string;
  coord: Coord;
  /** Tir d'une rafale de missile. */
  burst?: { center: Coord; size: number };
  /** Tir du barrage d'un fantôme. */
  barrage?: { size: number };
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
    const burst = {
      ...(shot.burst ? { burst: shot.burst } : {}),
      ...(shot.barrage ? { barrage: shot.barrage } : {}),
    };
    const base = { round, shooterId: shot.shooterId, targetId: shot.targetId, coord: shot.coord };
    // Case encore protégée : le tir est arrêté, rien n'est touché ni révélé, et la case
    // est percée (`evolve`). Contre l'état de début de manche : en salve, tous les tirs
    // de la manche sur cette case sont arrêtés, même un bouclier levé dans la manche.
    if (shieldCovers(target.shield, shot.coord)) {
      resolved.push({ ...base, result: 'BLOCKED', ...burst });
      continue;
    }
    if (!ship) {
      // Un leurre : annoncé touché, sans rien abîmer. C'est la fausse information qu'il donne.
      const decoy = target.decoys.some((d) => sameCoord(d, shot.coord));
      resolved.push({ ...base, result: decoy ? 'HIT' : 'MISS', ...burst });
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
      ...burst,
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
