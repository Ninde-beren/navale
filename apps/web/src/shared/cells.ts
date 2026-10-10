import clsx from 'clsx';
import { cellsOf, coordKey, sameCoord, shipSize } from '@navale/engine';
import type { Coord, GameSettings, Ship, ShipPlacement } from '@navale/protocol';

/** Classes de coque d'un bateau, case par case : début / milieu / fin selon l'orientation. */
export function hullClasses(cells: Coord[], orientation: 'H' | 'V'): Map<string, string> {
  const out = new Map<string, string>();
  const n = cells.length;
  cells.forEach((c, i) => {
    const pos = n === 1 ? '' : i === 0 ? 's' : i === n - 1 ? 'e' : 'm';
    out.set(coordKey(c), pos ? `${orientation === 'H' ? 'h' : 'v'}${pos}` : '');
  });
  return out;
}

/**
 * Classes des cases de ma propre grille : coques, touches, coulés, et ce que je suis
 * seul à voir de mes capacités : mes leurres (`tricked` une fois tirés) et mon bouclier.
 */
export function ownGridClasses(
  fleet: Ship[],
  revealed: Array<{ coord: Coord; result: 'MISS' | 'HIT' }>,
  extras: { decoys?: Coord[]; shielded?: Coord[] } = {},
): (x: number, y: number) => string {
  const map = new Map<string, string>();
  for (const ship of fleet) {
    const sunk = ship.hits.length >= ship.size;
    const hull = hullClasses(ship.cells, ship.orientation);
    for (const c of ship.cells) {
      const hit = ship.hits.some((h) => sameCoord(h, c));
      map.set(
        coordKey(c),
        clsx(sunk ? 'sunk' : 'ship', hull.get(coordKey(c)), hit && !sunk && 'hit'),
      );
    }
  }
  for (const r of revealed) if (r.result === 'MISS') map.set(coordKey(r.coord), 'miss');
  for (const d of extras.decoys ?? []) {
    const tricked = revealed.some((r) => sameCoord(r.coord, d));
    map.set(coordKey(d), clsx('decoy', tricked && 'tricked'));
  }
  for (const c of extras.shielded ?? [])
    map.set(coordKey(c), clsx(map.get(coordKey(c)), 'shielded'));
  return (x, y) => map.get(coordKey({ x, y })) ?? '';
}

/** Classes d'une grille publique : tirs reçus et bateaux coulés (mode classique). */
export function publicGridClasses(
  revealed: Array<{ coord: Coord; result: 'MISS' | 'HIT' }>,
  sunkShips: Array<{ size: number; cells?: Coord[] }>,
  highlight: Coord | null = null,
  /** Les cases sous un bouclier, publiques : tout le monde voit la zone protégée. */
  shielded: Coord[] = [],
): (x: number, y: number) => string {
  const map = new Map<string, string>();
  for (const r of revealed) map.set(coordKey(r.coord), r.result === 'MISS' ? 'miss' : 'hit');
  for (const s of sunkShips) {
    if (!s.cells || s.cells.length === 0) continue;
    const orientation = s.cells.length > 1 && s.cells[0]!.y === s.cells[1]!.y ? 'H' : 'V';
    const hull = hullClasses(s.cells, orientation);
    for (const c of s.cells) map.set(coordKey(c), clsx('sunk', hull.get(coordKey(c))));
  }
  if (highlight) map.set(coordKey(highlight), clsx(map.get(coordKey(highlight)), 'fresh'));
  for (const c of shielded) map.set(coordKey(c), clsx(map.get(coordKey(c)), 'shielded'));
  return (x, y) => map.get(coordKey({ x, y })) ?? '';
}

/** Classes des cases pendant le placement : coques, bateau sélectionné, conflits. */
export function placementClasses(
  settings: GameSettings,
  placements: ShipPlacement[],
  selected: number | null,
  conflicts: Set<number>,
): (x: number, y: number) => string {
  const map = new Map<string, string>();
  placements.forEach((p, i) => {
    const cells = cellsOf(p, shipSize(settings, p.type));
    const hull = hullClasses(cells, p.orientation);
    for (const c of cells) {
      const prev = map.get(coordKey(c));
      map.set(
        coordKey(c),
        clsx(
          'ship',
          hull.get(coordKey(c)),
          i === selected && 'picked',
          (conflicts.has(i) || prev) && 'conflict',
        ),
      );
    }
  });
  return (x, y) => map.get(coordKey({ x, y })) ?? '';
}
