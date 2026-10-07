import { cellsOf, coordKey } from '@navale/engine';
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

/** Classes des cases de ma propre grille : coques, touches, coulés. */
export function ownGridClasses(
  fleet: Ship[],
  revealed: Array<{ coord: Coord; result: 'MISS' | 'HIT' }>,
): (x: number, y: number) => string {
  const map = new Map<string, string>();
  for (const ship of fleet) {
    const sunk = ship.hits.length >= ship.size;
    const hull = hullClasses(ship.cells, ship.orientation);
    for (const c of ship.cells) {
      const hit = ship.hits.some((h) => h.x === c.x && h.y === c.y);
      map.set(
        coordKey(c),
        `${sunk ? 'sunk' : 'ship'} ${hull.get(coordKey(c)) ?? ''} ${hit && !sunk ? 'hit' : ''}`,
      );
    }
  }
  for (const r of revealed) if (r.result === 'MISS') map.set(coordKey(r.coord), 'miss');
  return (x, y) => map.get(coordKey({ x, y })) ?? '';
}

/** Classes d'une grille publique : tirs reçus et bateaux coulés (mode classique). */
export function publicGridClasses(
  revealed: Array<{ coord: Coord; result: 'MISS' | 'HIT' }>,
  sunkShips: Array<{ size: number; cells?: Coord[] }>,
  highlight: Coord | null = null,
): (x: number, y: number) => string {
  const map = new Map<string, string>();
  for (const r of revealed) map.set(coordKey(r.coord), r.result === 'MISS' ? 'miss' : 'hit');
  for (const s of sunkShips) {
    if (!s.cells || s.cells.length === 0) continue;
    const orientation = s.cells.length > 1 && s.cells[0]!.y === s.cells[1]!.y ? 'H' : 'V';
    const hull = hullClasses(s.cells, orientation);
    for (const c of s.cells) map.set(coordKey(c), `sunk ${hull.get(coordKey(c)) ?? ''}`);
  }
  if (highlight) map.set(coordKey(highlight), `${map.get(coordKey(highlight)) ?? ''} fresh`);
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
  const sizeOf = (type: string) => settings.fleet.find((s) => s.type === type)?.size ?? 1;
  placements.forEach((p, i) => {
    const cells = cellsOf(p, sizeOf(p.type));
    const hull = hullClasses(cells, p.orientation);
    for (const c of cells) {
      const prev = map.get(coordKey(c));
      const cls = `ship ${hull.get(coordKey(c)) ?? ''} ${i === selected ? 'picked' : ''} ${conflicts.has(i) || prev ? 'conflict' : ''}`;
      map.set(coordKey(c), cls);
    }
  });
  return (x, y) => map.get(coordKey({ x, y })) ?? '';
}
