import type { GameEvent, GameSettings } from '@navale/protocol';
import { randomShips } from '../placement.js';

/** Un bot arrive prêt : sa flotte tirée au hasard, puis son « prêt ». */
export function botReadyEvents(
  settings: GameSettings,
  playerId: string,
  random: () => number,
): GameEvent[] {
  return [
    { type: 'FLEET_PLACED', playerId, ships: randomShips(settings, random) },
    { type: 'PLAYER_READY_CHANGED', playerId, ready: true },
  ];
}
