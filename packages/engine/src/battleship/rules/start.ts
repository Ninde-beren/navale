import type { StartBlocker } from '@navale/protocol';
import type { GameState } from '../state.js';

/**
 * Ce qui empêche encore l'hôte de lancer la partie, ou `null` s'il peut le faire.
 * Le moteur s'en sert pour refuser START_GAME, et la vue le donne aux écrans.
 */
export function startBlocker(state: GameState): StartBlocker | null {
  if (state.status !== 'LOBBY') return null;
  if (state.players.length < 2) return 'NOT_ENOUGH_PLAYERS';
  if (!state.players.some((p) => p.kind === 'human')) return 'NO_HUMAN';
  if (state.players.some((p) => p.status !== 'READY')) return 'PLAYERS_NOT_READY';
  return null;
}
