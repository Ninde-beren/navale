import type { Bet, ResolvedShot } from '@navale/protocol';
import type { GameState, Player } from '../state.js';

/*
 * Les fantômes : les éliminés d'une partie `settings.eliminated === 'ghosts'`. Ils
 * pronostiquent chaque manche, sans rien voir de plus qu'un spectateur.
 */

/** Un fantôme pronostique la manche en cours, tant qu'elle est ouverte. */
export function canBet(state: GameState, p: Player): boolean {
  return (
    state.status === 'PLAYING' &&
    state.round !== null &&
    state.settings.eliminated === 'ghosts' &&
    p.status === 'ELIMINATED'
  );
}

/**
 * Ce qu'une manche a donné, pour régler les pronostics : `HIT` si au moins un tir a
 * touché (un coulé, un leurre aussi : c'est ce que tout le monde a vu), `MISS` sinon,
 * `null` sans aucun tir.
 */
export function roundOutcome(resolved: ReadonlyArray<Pick<ResolvedShot, 'result'>>): Bet | null {
  if (resolved.length === 0) return null;
  return resolved.some((s) => s.result === 'HIT' || s.result === 'SUNK') ? 'HIT' : 'MISS';
}
