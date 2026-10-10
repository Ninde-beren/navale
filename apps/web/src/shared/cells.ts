import clsx from 'clsx';
import { cellsOf, coordKey, radarZone, sameCoord, shieldCovers, shipSize } from '@navale/engine';
import type { Coord, GameSettings, Shield, Ship, ShipPlacement } from '@navale/protocol';

/** Les cases d'un bouclier à dessiner : celles qu'il protège encore, et celles qu'un tir a percées. */
export interface ShieldMarks {
  shielded: Coord[];
  pierced: Coord[];
}

const NO_SHIELD: ShieldMarks = { shielded: [], pierced: [] };

/**
 * Ce qu'un bouclier montre, publiquement, sur une grille : le verre sur les cases qu'il
 * protège encore, et un verre fêlé sur celles qu'un premier tir a percées, tant qu'elles
 * ne sont pas révélées (une case tirée montre son résultat, plus de verre).
 */
export function shieldMarks(
  settings: Pick<GameSettings, 'grid'>,
  shield: Shield | null,
  revealed: ReadonlyArray<{ coord: Coord }>,
): ShieldMarks {
  if (!shield) return NO_SHIELD;
  const open = (c: Coord) => !revealed.some((r) => sameCoord(r.coord, c));
  return {
    shielded: radarZone(settings, shield.center, shield.size).filter(
      (c) => open(c) && shieldCovers(shield, c),
    ),
    pierced: shield.pierced.filter(open),
  };
}

function markShield(map: Map<string, string>, marks: ShieldMarks): void {
  for (const c of marks.shielded) map.set(coordKey(c), clsx(map.get(coordKey(c)), 'shielded'));
  for (const c of marks.pierced) map.set(coordKey(c), clsx(map.get(coordKey(c)), 'pierced'));
}

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
  extras: { decoys?: Coord[]; shield?: ShieldMarks } = {},
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
  markShield(map, extras.shield ?? NO_SHIELD);
  return (x, y) => map.get(coordKey({ x, y })) ?? '';
}

/** Classes d'une grille publique : tirs reçus et bateaux coulés (mode classique). */
export function publicGridClasses(
  revealed: Array<{ coord: Coord; result: 'MISS' | 'HIT' }>,
  sunkShips: Array<{ size: number; cells?: Coord[] }>,
  highlight: Coord | null = null,
  /** Le bouclier du joueur, public : tout le monde voit la zone protégée et ses cases percées. */
  shield: ShieldMarks = NO_SHIELD,
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
  markShield(map, shield);
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
