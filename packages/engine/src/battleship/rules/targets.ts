import type { ResolvedShot } from '@navale/protocol';
import { sameCoord, type GameState } from '../state.js';

/** Les actions d'un tireur : une rafale de missile compte pour une seule. */
function actions(shots: ResolvedShot[]): ResolvedShot[] {
  return shots.filter((s, i) => {
    const prev = shots[i - 1];
    return !(
      s.burst &&
      prev?.burst &&
      prev.round === s.round &&
      sameCoord(prev.burst.center, s.burst.center)
    );
  });
}

/** Les joueurs vivants autres que le tireur, sans autre règle. */
function aliveOpponents(state: GameState, shooterId: string): string[] {
  return state.players
    .filter((p) => p.status === 'ALIVE' && p.playerId !== shooterId)
    .map((p) => p.playerId);
}

/**
 * Règle anti-acharnement (`settings.antiFocusMaxStreak`) : le joueur que le
 * tireur a visé lors de ses N dernières actions (un tir, ou une rafale de missile),
 * si elles l'ont toutes visé et qu'il reste une autre cible vivante. `null` sinon,
 * ou si la règle est éteinte.
 */
export function antiFocusBlocked(state: GameState, shooterId: string): string | null {
  const max = state.settings.antiFocusMaxStreak;
  if (max === null) return null;
  const opponents = aliveOpponents(state, shooterId);
  if (opponents.length < 2) return null;
  const mine = actions(state.shotsLog.filter((s) => s.shooterId === shooterId));
  if (mine.length < max) return null;
  const last = mine.slice(-max);
  const target = last[0]?.targetId;
  if (!target || !opponents.includes(target)) return null;
  return last.every((s) => s.targetId === target) ? target : null;
}

/**
 * Cibles légales d'un tireur : les joueurs vivants autres que lui, moins celui
 * que la règle anti-acharnement lui interdit pour ce tir.
 */
export function legalTargets(state: GameState, shooterId: string): string[] {
  const blocked = antiFocusBlocked(state, shooterId);
  return aliveOpponents(state, shooterId).filter((id) => id !== blocked);
}
