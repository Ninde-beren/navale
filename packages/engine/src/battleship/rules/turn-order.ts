import type { GameState } from '../state.js';
import { alivePlayers } from '../state.js';

/** Tireurs attendus pour la prochaine manche, selon la variante. */
export function nextShooters(state: GameState): string[] {
  const alive = alivePlayers(state).sort((a, b) => a.seat - b.seat);
  if (alive.length === 0) return [];
  if (state.settings.variant === 'simultaneous') return alive.map((p) => p.playerId);
  const last = state.lastShooterSeat;
  const next = last === null ? alive[0]! : (alive.find((p) => p.seat > last) ?? alive[0]!);
  return [next.playerId];
}

/** Ordre de résolution d'une salve : sièges croissants à partir de `index mod nombre de sièges`. */
export function resolutionOrder(
  state: GameState,
  roundIndex: number,
  shooterIds: string[],
): string[] {
  const seats = Math.max(1, state.players.length);
  const start = roundIndex % seats;
  const seatOf = (id: string) => state.players.find((p) => p.playerId === id)?.seat ?? 0;
  return [...shooterIds].sort((a, b) => {
    const ra = (seatOf(a) - start + seats) % seats;
    const rb = (seatOf(b) - start + seats) % seats;
    return ra - rb;
  });
}
