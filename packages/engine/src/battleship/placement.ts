import type { Coord, FleetError, GameSettings, Ship, ShipPlacement } from '@navale/protocol';
import { randomInt } from '../core/random.js';
import { coordKey, inBounds } from './state.js';

export function cellsOf(
  placement: Pick<ShipPlacement, 'bow' | 'orientation'>,
  size: number,
): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < size; i++) {
    cells.push(
      placement.orientation === 'H'
        ? { x: placement.bow.x + i, y: placement.bow.y }
        : { x: placement.bow.x, y: placement.bow.y + i },
    );
  }
  return cells;
}

function touches(a: Coord[], b: Coord[]): boolean {
  return a.some((p) => b.some((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1));
}

export type FleetValidation = { ok: true; ships: Ship[] } | { ok: false; errors: FleetError[] };

/**
 * Valide une flotte complète : composition exacte, bateaux dans la grille,
 * sans chevauchement, et sans contact si `shipsMayTouch` est faux.
 * Même fonction côté client (pré-validation) et côté serveur (autorité).
 */
export function validateFleet(
  settings: GameSettings,
  placements: ShipPlacement[],
): FleetValidation {
  const errors: FleetError[] = [];

  const expected = new Map<string, number>();
  for (const spec of settings.fleet) expected.set(spec.type, (expected.get(spec.type) ?? 0) + 1);
  const received = new Map<string, number>();
  for (const p of placements) received.set(p.type, (received.get(p.type) ?? 0) + 1);
  const compositionOk =
    placements.length === settings.fleet.length &&
    [...expected].every(([type, n]) => received.get(type) === n);
  if (!compositionOk) {
    errors.push({
      reason: 'WRONG_COMPOSITION',
      ships: placements.map((_, i) => i),
      detail: `attendu ${[...expected].map(([t, n]) => `${n}×${t}`).join(', ')}`,
    });
    return { ok: false, errors };
  }

  const sizeOf = (type: string) => settings.fleet.find((s) => s.type === type)!.size;
  const ships: Ship[] = placements.map((p, i) => ({
    shipId: `ship-${i}`,
    type: p.type,
    size: sizeOf(p.type),
    bow: p.bow,
    orientation: p.orientation,
    cells: cellsOf(p, sizeOf(p.type)),
    hits: [],
  }));

  ships.forEach((ship, i) => {
    if (!ship.cells.every((c) => inBounds(settings, c)))
      errors.push({ reason: 'OUT_OF_BOUNDS', ships: [i] });
  });
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i]!.cells;
      const b = ships[j]!.cells;
      const keys = new Set(a.map(coordKey));
      if (b.some((c) => keys.has(coordKey(c)))) errors.push({ reason: 'OVERLAP', ships: [i, j] });
      else if (!settings.shipsMayTouch && touches(a, b))
        errors.push({ reason: 'TOUCHING', ships: [i, j] });
    }
  }
  return errors.length === 0 ? { ok: true, ships } : { ok: false, errors };
}

/**
 * Placement aléatoire déterministe à partir de `random`. Sert au « placement
 * auto » du téléphone et aux bots. Place les plus grands bateaux d'abord.
 */
export function randomFleet(settings: GameSettings, random: () => number): ShipPlacement[] {
  const specs = settings.fleet
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => b.spec.size - a.spec.size || a.index - b.index);
  const { width, height } = settings.grid;

  for (let attempt = 0; attempt < 200; attempt++) {
    const placed: Array<{ index: number; placement: ShipPlacement; cells: Coord[] }> = [];
    const occupied = new Set<string>();
    let failed = false;
    for (const { spec, index } of specs) {
      let done = false;
      for (let tries = 0; tries < 500 && !done; tries++) {
        const orientation = random() < 0.5 ? 'H' : 'V';
        const bow: Coord =
          orientation === 'H'
            ? { x: randomInt(random, width - spec.size + 1), y: randomInt(random, height) }
            : { x: randomInt(random, width), y: randomInt(random, height - spec.size + 1) };
        const cells = cellsOf({ bow, orientation }, spec.size);
        if (cells.some((c) => occupied.has(coordKey(c)))) continue;
        if (!settings.shipsMayTouch && placed.some((p) => touches(p.cells, cells))) continue;
        for (const c of cells) occupied.add(coordKey(c));
        placed.push({ index, placement: { type: spec.type, bow, orientation }, cells });
        done = true;
      }
      if (!done) {
        failed = true;
        break;
      }
    }
    if (!failed) return placed.sort((a, b) => a.index - b.index).map((p) => p.placement);
  }
  throw new Error('randomFleet : impossible de placer la flotte dans cette grille');
}
