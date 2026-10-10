import { radarZone } from '@navale/engine';
import type { Coord } from '@navale/protocol';
import { RADAR_SWEEP } from './audio.js';

/*
 * Le balayage du radar, sur l'écran central comme sur le téléphone de son auteur :
 * le carré de la zone (rognée par la grille, comme la règle), un disque qui la couvre
 * et un rayon qui tourne depuis le nord, dans le sens des aiguilles d'une montre.
 * Ce module calcule la géométrie et le temps ; `ui/RadarSweep.tsx` dessine.
 */

/** Le fondu de sortie du disque et du carré, après le dernier tour, en ms. */
const FADE_MS = 200;

/** Durée d'un balayage, en ms : ses tours, puis le fondu. Le son du radar suit le même rythme. */
export const RADAR_SWEEP_MS = RADAR_SWEEP.turns * RADAR_SWEEP.turnSeconds * 1000 + FADE_MS;

/** Le carré de la zone, rogné par la grille : coin haut gauche et taille, en cases. */
export interface SweepZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** La zone d'un radar centré sur `center`, telle que la règle la compte (`radarZone`). */
export function sweepZone(
  grid: { width: number; height: number },
  center: Coord,
  size: number,
): { cells: Coord[]; box: SweepZone } {
  const cells = radarZone({ grid }, center, size);
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    cells,
    box: { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 },
  };
}

/**
 * L'instant où le rayon passe sur une case, en secondes depuis le début du balayage :
 * il part du nord du centre et tourne dans le sens des aiguilles d'une montre (sur la
 * grille, `y` descend). La case du centre s'allume tout de suite.
 */
export function beamDelay(center: Coord, cell: Coord): number {
  const dx = cell.x - center.x;
  const dy = cell.y - center.y;
  if (dx === 0 && dy === 0) return 0;
  const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
  return turn * RADAR_SWEEP.turnSeconds;
}
