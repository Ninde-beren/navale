import type { BotLevel, Coord, PlayerView, PublicPlayer } from '@navale/protocol';
import { pick, randomInt } from '../../core/random.js';
import { coordKey, inBounds } from '../state.js';

export interface BotShot {
  targetId: string;
  coord: Coord;
}

/** Le niveau du bot qui regarde cette vue, lu dans sa propre fiche publique ; `normal` sinon. */
export function botLevel(view: PlayerView): BotLevel {
  return view.players.find((p) => p.playerId === view.me.playerId)?.level ?? 'normal';
}

/**
 * Tir d'un bot, pur : il ne reçoit que la vue d'un joueur (grilles publiques,
 * ses cibles légales) et un `random` injecté. Il ne voit donc jamais la flotte
 * adverse, par construction. Trois niveaux :
 * - `easy` : une cible légale et une case non révélée, au hasard ;
 * - `normal` : chasse / ciblage (parité, voisines d'une touche, alignement) ;
 * - `hard` : la case que le plus de placements encore possibles recouvrent.
 */
export function chooseShot(
  view: PlayerView,
  random: () => number,
  level: BotLevel = botLevel(view),
): BotShot | null {
  const targets = legalTargetPlayers(view);
  if (targets.length === 0) return null;
  switch (level) {
    case 'easy':
      return randomShot(view, targets, random);
    case 'hard':
      return probabilityShot(view, targets, random);
    default:
      return huntShot(view, targets, random);
  }
}

function legalTargetPlayers(view: PlayerView): PublicPlayer[] {
  return view.me.legalTargets
    .map((id) => view.players.find((p) => p.playerId === id))
    .filter((p): p is PublicPlayer => p !== undefined);
}

/** Les cibles qui ont encore une case non révélée, avec ces cases. */
function openTargets(view: PlayerView, targets: PublicPlayer[]) {
  return targets.map((p) => ({ p, free: unrevealed(view, p) })).filter((t) => t.free.length > 0);
}

/** Facile : au hasard, sans mémoire ni méthode. */
function randomShot(
  view: PlayerView,
  targets: PublicPlayer[],
  random: () => number,
): BotShot | null {
  const open = openTargets(view, targets);
  if (open.length === 0) return null;
  const t = pick(random, open);
  return { targetId: t.p.playerId, coord: pick(random, t.free) };
}

/**
 * Normal : chasse / ciblage. Ciblage dès qu'une touche n'appartient pas à un
 * bateau coulé : une case voisine non révélée, dans l'alignement si deux touches
 * se suivent. Chasse sinon : une case au hasard, sur la parité du plus petit
 * bateau restant chez la cible.
 */
function huntShot(view: PlayerView, targets: PublicPlayer[], random: () => number): BotShot | null {
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

/**
 * Difficile : carte de probabilités. Pour chaque bateau non coulé, chaque
 * placement encore possible (dans la grille, sans case ratée ni case d'un bateau
 * coulé connu) ajoute un point à chacune de ses cases non révélées. S'il reste
 * des touches non conclues, seuls les placements qui les recouvrent comptent, et
 * d'autant plus qu'ils en recouvrent. On tire la case au plus fort cumul.
 */
function probabilityShot(
  view: PlayerView,
  targets: PublicPlayer[],
  random: () => number,
): BotShot | null {
  const wounded = targets
    .map((p) => ({ p, cells: woundedCells(p) }))
    .filter((w) => w.cells.length > 0)
    .sort((a, b) => b.cells.length - a.cells.length);
  const open = openTargets(view, targets);
  if (open.length === 0) return null;
  const target = wounded[0]?.p ?? pick(random, open).p;
  const best = densestCells(view, target);
  if (best.length > 0) return { targetId: target.playerId, coord: pick(random, best) };
  const fallback = open.find((t) => t.p.playerId === target.playerId) ?? open[0]!;
  return { targetId: fallback.p.playerId, coord: pick(random, fallback.free) };
}

/** Les cases non révélées au cumul maximal chez une cible ; vide si aucun placement n'est possible. */
export function densestCells(view: PlayerView, p: PublicPlayer): Coord[] {
  const { width, height } = view.settings.grid;
  const miss = new Set(p.revealed.filter((r) => r.result === 'MISS').map((r) => coordKey(r.coord)));
  const hit = new Set(p.revealed.filter((r) => r.result === 'HIT').map((r) => coordKey(r.coord)));
  const sunk = new Set(p.sunkShips.flatMap((s) => (s.cells ?? []).map(coordKey)));
  const woundedKeys = new Set(woundedCells(p).map(coordKey));
  const blocked = (c: Coord) => miss.has(coordKey(c)) || sunk.has(coordKey(c));

  const density = new Map<string, number>();
  const count = (onlyThroughWounded: boolean): number => {
    density.clear();
    let total = 0;
    for (const size of remainingSizes(view, p)) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        for (let y = 0; y + dy * (size - 1) < height; y++) {
          for (let x = 0; x + dx * (size - 1) < width; x++) {
            const cells = Array.from({ length: size }, (_, i) => ({
              x: x + dx * i,
              y: y + dy * i,
            }));
            if (cells.some(blocked)) continue;
            const covers = cells.filter((c) => woundedKeys.has(coordKey(c))).length;
            const weight = onlyThroughWounded ? covers : 1;
            if (weight === 0) continue;
            for (const c of cells) {
              if (hit.has(coordKey(c))) continue;
              density.set(coordKey(c), (density.get(coordKey(c)) ?? 0) + weight);
              total += weight;
            }
          }
        }
      }
    }
    return total;
  };
  if (woundedKeys.size === 0 || count(true) === 0) count(false);
  const max = Math.max(0, ...density.values());
  if (max === 0) return [];
  return [...density.entries()]
    .filter(([, n]) => n === max)
    .map(([key]) => key.split(',').map(Number))
    .map(([x, y]) => ({ x: x ?? 0, y: y ?? 0 }));
}

/** Tailles des bateaux non coulés chez un joueur, d'après la flotte des réglages et ses bateaux coulés. */
function remainingSizes(view: PlayerView, p: PublicPlayer): number[] {
  const sizes = view.settings.fleet.map((s) => s.size);
  for (const s of p.sunkShips) {
    const i = sizes.indexOf(s.size);
    if (i >= 0) sizes.splice(i, 1);
  }
  return sizes;
}

/** Touches non conclues : révélées `HIT`, hors des bateaux coulés connus. */
export function woundedCells(p: PublicPlayer): Coord[] {
  const sunk = new Set(p.sunkShips.flatMap((s) => (s.cells ?? []).map(coordKey)));
  return p.revealed
    .filter((r) => r.result === 'HIT' && !sunk.has(coordKey(r.coord)))
    .map((r) => r.coord);
}

/** Cases déjà révélées chez un joueur, en clés `x,y`. */
function revealedKeys(p: PublicPlayer): Set<string> {
  return new Set(p.revealed.map((r) => coordKey(r.coord)));
}

function unrevealed(view: PlayerView, p: PublicPlayer): Coord[] {
  const taken = revealedKeys(p);
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
  const taken = revealedKeys(p);
  const ok = (c: Coord) => inBounds(view.settings, c) && !taken.has(coordKey(c));
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
