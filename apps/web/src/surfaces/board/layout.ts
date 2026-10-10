import type { GameView } from '@navale/protocol';

/** La disposition de l'écran central en partie et en fin : à deux, à trois, ou à quatre (par défaut). */
export function boardLayout(view: GameView): 'p2' | 'p3' | '' {
  if (view.status !== 'PLAYING' && view.status !== 'FINISHED') return '';
  const n = view.players.length;
  return n <= 2 ? 'p2' : n === 3 ? 'p3' : '';
}
