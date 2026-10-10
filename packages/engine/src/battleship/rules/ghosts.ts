import type { Bet, Coord, GhostCard, GhostPlay, LitCell, ResolvedShot } from '@navale/protocol';
import { pick } from '../../core/random.js';
import {
  alivePlayers,
  commanderOf,
  coordKey,
  playerById,
  sameCoord,
  type GameState,
  type Player,
} from '../state.js';
import type { ShotToResolve } from './resolve.js';

/*
 * Les fantômes : les éliminés d'une partie `settings.eliminated === 'ghosts'`. Ils
 * pronostiquent chaque manche, sans rien voir de plus qu'un spectateur, et jouent une
 * carte tous les quelques tours de table. Chaque carte est juste pour tous les survivants :
 * elle frappe chacun pareil, ou n'apprend à tout le monde qu'une case.
 */

/** Toutes les cartes, pour un fantôme dont le commandant n'en laisse pas (ou sans commandant). */
export const GHOST_CARDS: readonly GhostCard[] = ['wisp', 'barrage', 'low_tide'];

/**
 * Le souffle du fantôme avant sa carte, sur l'écran central : un temps d'annonce de plus,
 * dérivé de `settings.revealDelayMs` comme l'écart des départs d'une rafale.
 */
export function ghostLeadMs(revealDelayMs: number): number {
  return Math.round(revealDelayMs * 0.16);
}

/** Un fantôme pronostique la manche en cours, tant qu'elle est ouverte. */
export function canBet(state: GameState, p: Player): boolean {
  return (
    state.status === 'PLAYING' &&
    state.round !== null &&
    state.settings.eliminated === 'ghosts' &&
    p.status === 'ELIMINATED'
  );
}

/**
 * Les cartes qu'un fantôme peut jouer dans la manche en cours : celle de son commandant,
 * ou les trois au choix ; aucune avant `ghostReadyAt` ni s'il en a déjà engagé une.
 */
export function ghostCards(state: GameState, p: Player): GhostCard[] {
  const round = state.round;
  if (!canBet(state, p) || !round || p.ghostReadyAt === null || round.index < p.ghostReadyAt)
    return [];
  if (round.ghostPlays[p.playerId]) return [];
  const card = commanderOf(state, p)?.ghostCard;
  return card ? [card] : [...GHOST_CARDS];
}

/**
 * La manche de la carte suivante : `ghostCardEveryTurns` tours de table plus tard, soit
 * autant de manches en salve, et autant de fois le nombre de survivants en tour par tour.
 */
export function nextGhostReady(state: GameState, round: number): number {
  const turn =
    state.settings.variant === 'sequential' ? Math.max(1, alivePlayers(state).length) : 1;
  return round + state.settings.ghostCardEveryTurns * turn;
}

/** Les cases encore à tirer chez un joueur. */
function unrevealedCells(state: GameState, p: Player): Coord[] {
  const taken = new Set(p.shotsReceived.map((s) => coordKey(s.coord)));
  const out: Coord[] = [];
  for (let y = 0; y < state.settings.grid.height; y++)
    for (let x = 0; x < state.settings.grid.width; x++)
      if (!taken.has(coordKey({ x, y }))) out.push({ x, y });
  return out;
}

/** Le barrage : un tir sur une case au hasard chez chaque survivant, tous partis ensemble. */
export function barrageShots(
  state: GameState,
  ghostId: string,
  random: () => number,
): ShotToResolve[] {
  const targets = alivePlayers(state)
    .map((p) => ({ p, free: unrevealedCells(state, p) }))
    .filter((t) => t.free.length > 0);
  const barrage = { size: targets.length };
  return targets.map(({ p, free }) => ({
    shooterId: ghostId,
    targetId: p.playerId,
    coord: pick(random, free),
    barrage,
  }));
}

/**
 * La marée basse : chez chaque survivant, une case de navire au hasard, intacte et pas
 * encore éclairée, découverte pour tous. Un vrai navire : la mer ne découvre pas un leurre.
 */
export function lowTideCells(
  state: GameState,
  random: () => number,
): Array<LitCell & { targetId: string }> {
  const out: Array<LitCell & { targetId: string }> = [];
  for (const p of alivePlayers(state)) {
    const lit = new Set(p.lit.map((l) => coordKey(l.coord)));
    const hull = p.fleet
      .flatMap((ship) => ship.cells.filter((c) => !ship.hits.some((h) => sameCoord(h, c))))
      .filter((c) => !lit.has(coordKey(c)));
    if (hull.length > 0) out.push({ targetId: p.playerId, coord: pick(random, hull), ship: true });
  }
  return out;
}

/**
 * Le feu follet : la case visée, éclairée pour tous ; un leurre y passe pour un navire,
 * comme au radar. Il s'éteint sans rien montrer si, entre-temps, la case a été révélée,
 * éclairée par un autre fantôme de la même manche, ou sa cible éliminée.
 */
export function wispCells(
  state: GameState,
  play: GhostPlay,
): Array<LitCell & { targetId: string }> {
  const target = play.targetId ? playerById(state, play.targetId) : undefined;
  const coord = play.coord;
  if (!target || !coord || target.status !== 'ALIVE') return [];
  if (target.shotsReceived.some((s) => sameCoord(s.coord, coord))) return [];
  if (target.lit.some((l) => sameCoord(l.coord, coord))) return [];
  const ship =
    target.fleet.some((s) => s.cells.some((c) => sameCoord(c, coord))) ||
    target.decoys.some((d) => sameCoord(d, coord));
  return [{ targetId: target.playerId, coord, ship }];
}

/**
 * Ce qu'une manche a donné, pour régler les pronostics : `HIT` si au moins un tir a
 * touché (un coulé, un leurre aussi : c'est ce que tout le monde a vu), `MISS` sinon,
 * `null` sans aucun tir.
 */
export function roundOutcome(resolved: ReadonlyArray<Pick<ResolvedShot, 'result'>>): Bet | null {
  if (resolved.length === 0) return null;
  return resolved.some((s) => s.result === 'HIT' || s.result === 'SUNK') ? 'HIT' : 'MISS';
}
