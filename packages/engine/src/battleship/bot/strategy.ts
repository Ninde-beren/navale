import type { Coord, PlayerView, PublicPlayer } from '@navale/protocol';
import { pick, randomInt } from '../../core/random.js';
import { coordKey } from '../state.js';

export interface BotShot {
  targetId: string;
  coord: Coord;
}

/**
 * Stratégie « chasse / ciblage », pure : elle ne reçoit que la vue d'un joueur
 * (grilles publiques, ses cibles légales) et un `random` injecté. Elle ne voit
 * donc jamais la flotte adverse, par construction.
 *
 * Ciblage : dès qu'une touche n'appartient pas à un bateau coulé, tirer une case
 * voisine non révélée, dans l'alignement si deux touches se suivent.
 * Chasse : une case non révélée au hasard, sur la parité du plus petit bateau
 * restant chez la cible.
 */
export function chooseShot(view: PlayerView, random: () => number): BotShot | null {
  const targets = view.me.legalTargets
    .map((id) => view.players.find((p) => p.playerId === id))
    .filter((p): p is PublicPlayer => p !== undefined);
  if (targets.length === 0) return null;

  // Une cible blessée d'abord : celle qui a le plus de touches non conclues.
  const wounded = targets
    .map((p) => ({ p, cells: woundedCells(p) }))
    .filter((w) => w.cells.length > 0)
    .sort((a, b) => b.cells.length - a.cells.length);
  if (wounded.length > 0) {
    const best = wounded[0]!;
    const candidates = aroundWounded(view, best.p, best.cells);
    if (candidates.length > 0)
      return { targetId: best.p.playerId, coord: pick(random, candidates) };
  }

  const target = pick(random, targets);
  const free = unrevealed(view, target);
  if (free.length === 0) {
    // Cette cible n'a plus de case libre : on en cherche une autre.
    const other = targets
      .map((p) => ({ p, free: unrevealed(view, p) }))
      .find((t) => t.free.length > 0);
    return other ? { targetId: other.p.playerId, coord: pick(random, other.free) } : null;
  }
  // Parité du plus petit bateau restant : la classe qui garde le plus de cases libres, au hasard en cas d'égalité.
  const step = smallestRemainingShip(view, target);
  const counts = Array.from(
    { length: step },
    (_, k) => free.filter((c) => (c.x + c.y) % step === k).length,
  );
  const best = Math.max(...counts);
  const classes = counts.map((n, k) => (n === best ? k : -1)).filter((k) => k >= 0);
  const offset = classes[randomInt(random, classes.length)] ?? 0;
  const onParity = free.filter((c) => (c.x + c.y) % step === offset);
  return { targetId: target.playerId, coord: pick(random, onParity.length > 0 ? onParity : free) };
}

/** Touches non conclues : révélées `HIT`, hors des bateaux coulés connus. */
export function woundedCells(p: PublicPlayer): Coord[] {
  const sunk = new Set(p.sunkShips.flatMap((s) => (s.cells ?? []).map(coordKey)));
  return p.revealed
    .filter((r) => r.result === 'HIT' && !sunk.has(coordKey(r.coord)))
    .map((r) => r.coord);
}

function unrevealed(view: PlayerView, p: PublicPlayer): Coord[] {
  const taken = new Set(p.revealed.map((r) => coordKey(r.coord)));
  const out: Coord[] = [];
  for (let y = 0; y < view.settings.grid.height; y++)
    for (let x = 0; x < view.settings.grid.width; x++)
      if (!taken.has(coordKey({ x, y }))) out.push({ x, y });
  return out;
}

function smallestRemainingShip(view: PlayerView, p: PublicPlayer): number {
  const sizes = view.settings.fleet.map((s) => s.size).sort((a, b) => a - b);
  const sunkSizes = p.sunkShips.map((s) => s.size).sort((a, b) => a - b);
  for (const size of sizes) {
    const i = sunkSizes.indexOf(size);
    if (i >= 0) sunkSizes.splice(i, 1);
    else return Math.max(1, size);
  }
  return 1;
}

/** Cases à tirer autour des touches : les bouts d'une ligne de touches d'abord, sinon les quatre voisines. */
function aroundWounded(view: PlayerView, p: PublicPlayer, wounded: Coord[]): Coord[] {
  const taken = new Set(p.revealed.map((r) => coordKey(r.coord)));
  const inBounds = (c: Coord) =>
    c.x >= 0 && c.y >= 0 && c.x < view.settings.grid.width && c.y < view.settings.grid.height;
  const ok = (c: Coord) => inBounds(c) && !taken.has(coordKey(c));
  const keys = new Set(wounded.map(coordKey));

  // Lignes de touches adjacentes (horizontales puis verticales) : on prolonge aux deux bouts.
  const lineEnds: Coord[] = [];
  for (const c of wounded) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const next = { x: c.x + dx, y: c.y + dy };
      if (!keys.has(coordKey(next))) continue;
      // c et next sont alignés : chercher les extrémités de la chaîne.
      let a = c;
      while (keys.has(coordKey({ x: a.x - dx, y: a.y - dy }))) a = { x: a.x - dx, y: a.y - dy };
      let b = next;
      while (keys.has(coordKey({ x: b.x + dx, y: b.y + dy }))) b = { x: b.x + dx, y: b.y + dy };
      for (const end of [
        { x: a.x - dx, y: a.y - dy },
        { x: b.x + dx, y: b.y + dy },
      ])
        if (ok(end)) lineEnds.push(end);
    }
  }
  if (lineEnds.length > 0) return dedupe(lineEnds);

  const neighbours: Coord[] = [];
  for (const c of wounded) {
    for (const n of [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 },
    ])
      if (ok(n)) neighbours.push(n);
  }
  return dedupe(neighbours);
}

function dedupe(cells: Coord[]): Coord[] {
  const seen = new Set<string>();
  return cells.filter((c) => (seen.has(coordKey(c)) ? false : (seen.add(coordKey(c)), true)));
}
