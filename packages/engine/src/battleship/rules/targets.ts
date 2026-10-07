import type { GameState } from '../state.js';

/**
 * Cibles légales d'un tireur : les joueurs vivants autres que lui.
 * C'est le point d'extension d'une future règle anti-focus.
 */
export function legalTargets(state: GameState, shooterId: string): string[] {
  return state.players
    .filter((p) => p.status === 'ALIVE' && p.playerId !== shooterId)
    .map((p) => p.playerId);
}
