import type { GameEvent, VisibleEvent } from '@navale/protocol';
import { sameCoord } from '../state.js';
import { burstStaggerMs } from './abilities.js';
import { ghostLeadMs } from './ghosts.js';

/** La cadence d'un lot d'événements : quand chacun part, en ms après le premier, et la durée du lot. */
export interface Pacing {
  offsets: number[];
  total: number;
}

/**
 * Le rythme de l'écran central pour un lot d'événements, celui d'une commande : chaque tir,
 * et chaque capacité jouée, a son temps d'annonce (`revealDelayMs`). Les tirs d'une rafale de
 * missile ou du barrage d'un fantôme partent ensemble : l'écran central les fait décoller à
 * la suite et ne les annonce qu'une fois ; le délai suit le dernier, allongé des départs
 * décalés (et du souffle du fantôme). Des cases éclairées par un fantôme ont leur annonce.
 * Le serveur publie à ce rythme ; le lecteur de replay le reprend.
 */
export function pacing(
  events: ReadonlyArray<GameEvent | VisibleEvent>,
  revealDelayMs: number,
): Pacing {
  const delay = revealDelayMs;
  const offsets: number[] = [];
  let t = 0;
  events.forEach((event, i) => {
    offsets.push(t);
    if (event.type === 'SHOT_RESOLVED') {
      const next = events[i + 1];
      const continues =
        next?.type === 'SHOT_RESOLVED' &&
        next.shooterId === event.shooterId &&
        ((event.burst !== undefined &&
          next.burst !== undefined &&
          sameCoord(next.burst.center, event.burst.center)) ||
          (event.barrage !== undefined && next.barrage !== undefined));
      const volley = event.burst?.size ?? event.barrage?.size ?? 1;
      const lead = event.barrage ? ghostLeadMs(delay) : 0;
      if (!continues) t += delay + lead + (volley - 1) * burstStaggerMs(delay);
    } else if (event.type === 'ABILITY_USED' && event.ability !== 'missile') {
      t += delay;
    } else if (event.type === 'CELLS_LIT') {
      t += delay + ghostLeadMs(delay);
    }
  });
  return { offsets, total: t };
}
