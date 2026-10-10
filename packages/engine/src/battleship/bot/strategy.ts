import type { BotLevel, Coord, PlayerView, PublicPlayer } from '@navale/protocol';
import { pick, randomInt } from '../../core/random.js';
import {
  decoyCells,
  missileStrikes,
  radarZone,
  repairableCells,
  shieldCovers,
} from '../rules/abilities.js';
import { coordKey, inBounds } from '../state.js';

export interface BotShot {
  targetId: string;
  coord: Coord;
}

/** Ce que le bot joue : un tir, ou la capacité de son commandant (`ability`). */
export interface BotAction extends BotShot {
  ability: boolean;
}

/**
 * L'action d'un bot pour son tour : sa capacité quand elle sert (voir `abilityAction`),
 * sinon un tir. `useAbilities` est faux pour le relais d'un humain absent : il tire,
 * mais ne dépense pas la capacité de celui qu'il remplace.
 */
export function chooseAction(
  view: PlayerView,
  random: () => number,
  level: BotLevel = botLevel(view),
  useAbilities = true,
): BotAction | null {
  if (useAbilities && view.me.canUseAbility) {
    const action = abilityAction(view, random);
    if (action) return { ...action, ability: true };
  }
  const shot = chooseShot(view, random, level);
  return shot ? { ...shot, ability: false } : null;
}

/**
 * Quand un bot joue sa capacité, et où. Sur sa flotte : réparer ou protéger dès qu'un
 * de ses bateaux à flot est touché, poser son leurre dès la deuxième manche. Chez un
 * adversaire : le missile dès qu'une touche reste à achever (centré dessus, la croix
 * frappe ses voisines) ; le radar ou le sonar en chasse, dès la deuxième manche, sur
 * l'adversaire qui a le plus de cases inconnues, au cœur de sa grille.
 */
function abilityAction(view: PlayerView, random: () => number): BotShot | null {
  const meId = view.me.playerId;
  const me = view.players.find((p) => p.playerId === meId);
  const commander = view.settings.commanders.find((c) => c.id === me?.commanderId);
  if (!me || !commander) return null;
  const round = view.round?.index ?? 0;
  const ability = commander.ability;
  switch (ability.type) {
    case 'repair':
    case 'shield': {
      const wounded = repairableCells(view.me.fleet);
      return wounded.length > 0 ? { targetId: meId, coord: pick(random, wounded) } : null;
    }
    case 'decoy': {
      if (round < 1) return null;
      const free = decoyCells(view.settings, view.me.fleet, me.revealed, view.me.decoys);
      return free.length > 0 ? { targetId: meId, coord: pick(random, free) } : null;
    }
    case 'missile': {
      const targets = legalTargetPlayers(view);
      let best: { targetId: string; coord: Coord; strikes: number } | null = null;
      for (const p of targets)
        for (const c of woundedCells(p)) {
          // Une croix qui ne tombe que sur des cases protégées serait toute bloquée.
          const strikes = missileStrikes(view.settings, c, p.revealed).filter(
            (s) => !shieldCovers(p.shield, s),
          ).length;
          if (strikes > 0 && (!best || strikes > best.strikes))
            best = { targetId: p.playerId, coord: c, strikes };
        }
      return best && { targetId: best.targetId, coord: best.coord };
    }
    case 'radar':
    case 'sonar': {
      if (round < 1) return null;
      const opponents = view.players.filter((p) => p.status === 'ALIVE' && p.playerId !== meId);
      // Une touche à achever passe avant : le détecteur sert à chercher, pas à finir.
      if (opponents.some((p) => woundedCells(p).length > 0)) return null;
      const scored = opponents
        .map((p) => ({ p, free: unrevealed(view, p) }))
        .filter((s) => s.free.length > 0)
        .sort((a, b) => b.free.length - a.free.length);
      const target = scored[0];
      if (!target) return null;
      // Le centre qui voit le plus de cases inconnues dans sa zone.
      const unknown = new Set(target.free.map(coordKey));
      const seen = (c: Coord) =>
        radarZone(view.settings, c, ability.size).filter((z) => unknown.has(coordKey(z))).length;
      const top = Math.max(...target.free.map(seen));
      const centers = target.free.filter((c) => seen(c) === top);
      return { targetId: target.p.playerId, coord: pick(random, centers) };
    }
  }
}

/** Les cases que mes radars ont vues comme un navire chez cette cible, encore à tirer. */
function radarContacts(view: PlayerView, p: PublicPlayer): Coord[] {
  const closed = closedKeys(p);
  const out = new Map<string, Coord>();
  for (const r of view.me.radarResults)
    if (r.targetId === p.playerId)
      for (const c of r.contacts ?? []) if (!closed.has(coordKey(c))) out.set(coordKey(c), c);
  return [...out.values()];
}

/**
 * Le niveau du bot qui regarde cette vue, lu dans sa propre fiche publique : celui
 * d'un bot, ou celui du relais d'un humain absent ; `normal` sinon.
 */
export function botLevel(view: PlayerView): BotLevel {
  const me = view.players.find((p) => p.playerId === view.me.playerId);
  return me?.level ?? me?.substitute ?? 'normal';
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
  // Un navire vu au radar se tire d'abord, sauf pour le bot facile qui tire au hasard.
  if (level !== 'easy') {
    const seen = targets
      .map((p) => ({ p, cells: radarContacts(view, p) }))
      .find((s) => s.cells.length > 0);
    if (seen) return { targetId: seen.p.playerId, coord: pick(random, seen.cells) };
  }
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
    const candidates = cheapest(best.p, aroundWounded(view, best.p, best.cells));
    if (candidates.length > 0)
      return { targetId: best.p.playerId, coord: pick(random, candidates) };
  }

  const target = pick(random, targets);
  const free = cheapest(target, unrevealed(view, target));
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
 * placement encore possible (dans la grille, sans case ratée, sans case d'un bateau
 * coulé connu, sans case que mes détections savent vide) ajoute un point à chacune
 * de ses cases non révélées, pondéré par ce que mes sonars ont compté (`sonarFit`).
 * S'il reste des touches non conclues, seuls les placements qui les recouvrent
 * comptent, et d'autant plus qu'ils en recouvrent. On tire la case au plus fort cumul.
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
  const miss = new Set(p.revealed.filter((r) => r.result === 'MISS').map((r) => coordKey(r.coord)));
  const hit = new Set(p.revealed.filter((r) => r.result === 'HIT').map((r) => coordKey(r.coord)));
  const sunk = new Set(p.sunkShips.flatMap((s) => (s.cells ?? []).map(coordKey)));
  const woundedKeys = new Set(woundedCells(p).map(coordKey));
  const known = detections(view, p);
  const blocked = (c: Coord) =>
    miss.has(coordKey(c)) || sunk.has(coordKey(c)) || known.water.has(coordKey(c));
  const fit = sonarFit(view, p, known.sonars, blocked, hit);

  const density = new Map<string, number>();
  const count = (onlyThroughWounded: boolean): number => {
    density.clear();
    let total = 0;
    placements(view, p, blocked, (cells) => {
      const covers = cells.filter((c) => woundedKeys.has(coordKey(c))).length;
      const weight = (onlyThroughWounded ? covers : 1) * fit(cells);
      if (weight === 0) return;
      for (const c of cells) {
        if (hit.has(coordKey(c))) continue;
        density.set(coordKey(c), (density.get(coordKey(c)) ?? 0) + weight);
        total += weight;
      }
    });
    return total;
  };
  if (woundedKeys.size === 0 || count(true) === 0) count(false);
  // Une case protégée coûte un tir bloqué avant d'apprendre quoi que ce soit : son
  // cumul compte pour moitié.
  const scored = [...density.entries()].map(([key, n]) => {
    const [x = 0, y = 0] = key.split(',').map(Number);
    const c = { x, y };
    return { c, score: shieldCovers(p.shield, c) ? n / 2 : n };
  });
  const max = Math.max(0, ...scored.map((s) => s.score));
  if (max === 0) return [];
  return scored.filter((s) => s.score === max).map((s) => s.c);
}

/**
 * Parmi des cases d'égal intérêt, celles qu'aucun bouclier ne protège encore : le bot
 * ne tire sous un bouclier que s'il n'a pas mieux, par exemple pour achever un navire.
 */
function cheapest(p: PublicPlayer, cells: Coord[]): Coord[] {
  const open = cells.filter((c) => !shieldCovers(p.shield, c));
  return open.length > 0 ? open : cells;
}

/** Chaque placement encore possible d'un bateau non coulé chez ce joueur : ses cases, aucune `blocked`. */
function placements(
  view: PlayerView,
  p: PublicPlayer,
  blocked: (c: Coord) => boolean,
  visit: (cells: Coord[]) => void,
): void {
  const { width, height } = view.settings.grid;
  for (const size of remainingSizes(view, p))
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const)
      for (let y = 0; y + dy * (size - 1) < height; y++)
        for (let x = 0; x + dx * (size - 1) < width; x++) {
          const cells = Array.from({ length: size }, (_, i) => ({ x: x + dx * i, y: y + dy * i }));
          if (!cells.some(blocked)) visit(cells);
        }
}

/** Un sonar chez ce joueur : ses cases encore inconnues, et combien de cases de navire il y reste. */
interface SonarCount {
  cells: Set<string>;
  left: number;
}

/**
 * Ce que mes radars et mes sonars ont appris chez ce joueur. `water` : les cases sûres
 * d'être de l'eau, la zone d'un radar hors de ses contacts, et toute la zone d'un sonar
 * dont le total est déjà trouvé. `sonars` : pour les autres sonars, les cases inconnues
 * de la zone et le nombre de cases de navire qui y restent, le total moins les touches
 * déjà révélées dedans (un leurre compte comme un navire, pour le sonar comme au tir).
 */
function detections(
  view: PlayerView,
  p: PublicPlayer,
): { water: Set<string>; sonars: SonarCount[] } {
  const hits = new Set(p.revealed.filter((r) => r.result === 'HIT').map((r) => coordKey(r.coord)));
  const revealed = new Set(p.revealed.map((r) => coordKey(r.coord)));
  const water = new Set<string>();
  const counts: SonarCount[] = [];
  for (const r of view.me.radarResults) {
    if (r.targetId !== p.playerId) continue;
    const zone = radarZone(view.settings, r.center, r.size).map(coordKey);
    if (r.contacts) {
      const ships = new Set(r.contacts.map(coordKey));
      for (const key of zone) if (!ships.has(key)) water.add(key);
    } else {
      // Un leurre posé après le sondage et tiré dans la zone peut faire passer le reste sous zéro.
      const left = Math.max(0, r.shipCells - zone.filter((key) => hits.has(key)).length);
      counts.push({ cells: new Set(zone.filter((key) => !revealed.has(key))), left });
    }
  }
  for (const count of counts) if (count.left === 0) for (const key of count.cells) water.add(key);
  return { water, sonars: counts.filter((count) => count.left > 0) };
}

/**
 * Le poids d'un placement d'après le total de mes sonars. Un bateau qui couvrirait plus
 * de cases inconnues d'une zone qu'il n'y reste de cases de navire est impossible (0).
 * Sinon, s'il en couvre `k`, les autres bateaux doivent fournir `left - k` cases dans la
 * zone : en approchant leur apport par une loi de Poisson de moyenne `λ`, les cases qu'on
 * y attendait sans le sonar, le poids vaut left × (left - 1) × … (k facteurs) / λ^k.
 * Une zone qui compte plus que prévu attire les placements, une zone pauvre les repousse.
 */
function sonarFit(
  view: PlayerView,
  p: PublicPlayer,
  sonars: SonarCount[],
  blocked: (c: Coord) => boolean,
  hit: Set<string>,
): (cells: Coord[]) => number {
  if (sonars.length === 0) return () => 1;
  // Sans le sonar : la part de chaque case dans les placements possibles, ramenée
  // au nombre de cases de navire encore inconnues.
  const prior = new Map<string, number>();
  let total = 0;
  placements(view, p, blocked, (cells) => {
    for (const c of cells)
      if (!hit.has(coordKey(c))) {
        prior.set(coordKey(c), (prior.get(coordKey(c)) ?? 0) + 1);
        total++;
      }
  });
  const unknownShipCells =
    remainingSizes(view, p).reduce((sum, size) => sum + size, 0) - woundedCells(p).length;
  const expected = sonars.map((count) => {
    let mass = 0;
    for (const key of count.cells) mass += prior.get(key) ?? 0;
    return Math.max((mass / Math.max(total, 1)) * unknownShipCells, Number.EPSILON);
  });
  return (cells) => {
    let weight = 1;
    sonars.forEach((count, i) => {
      const k = cells.filter((c) => count.cells.has(coordKey(c))).length;
      for (let j = 0; j < k; j++) weight *= Math.max(0, count.left - j) / expected[i]!;
    });
    return weight;
  };
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

/** Cases qu'on ne peut plus tirer chez un joueur : déjà révélées ; en clés `x,y`. */
function closedKeys(p: PublicPlayer): Set<string> {
  return new Set(p.revealed.map((r) => coordKey(r.coord)));
}

/** Cases encore à tirer chez un joueur : non révélées, protégées ou non. */
function unrevealed(view: PlayerView, p: PublicPlayer): Coord[] {
  const taken = closedKeys(p);
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
  const taken = closedKeys(p);
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
