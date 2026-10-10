import { describe, expect, it } from 'vitest';
import type { GameEvent, GameEventOf, GhostCard, ShipPlacement } from '@navale/protocol';
import { chooseGhostCard, chooseShot } from '../src/battleship/bot/strategy.js';
import { mulberry32 } from '../src/core/random.js';
import {
  privateRecipient,
  projectPrivate,
  projectPublic,
  publicEvent,
} from '../src/battleship/project.js';
import { ghostLeadMs } from '../src/battleship/rules/ghosts.js';
import { COMMANDERS } from '../src/battleship/settings.js';
import { coordKey, sameCoord } from '../src/battleship/state.js';
import { assertNoLeak } from './leak.js';
import {
  COLORS,
  Harness,
  HOST,
  TINY_FLEET,
  player,
  startedGame,
  tinySettings,
  turn,
} from './helpers.js';

/** La carte d'un fantôme, pour la manche en cours. */
function play(
  h: Harness,
  ghostId: string,
  card: GhostCard,
  aim: Partial<{ targetId: string; coord: { x: number; y: number } }> = {},
) {
  return h.run(player(ghostId), {
    type: 'PLAY_GHOST_CARD',
    round: h.state.round!.index,
    card,
    ...aim,
  });
}

function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T): GameEventOf<T>[] {
  return events.filter((e): e is GameEventOf<T> => e.type === type);
}

/** Trois joueurs sans commandant, torpilleur de deux cases : Julie coulée à la quatrième manche. */
function withGhost() {
  const { h, ids } = startedGame(3, tinySettings(), TINY_FLEET);
  const [a, j, m] = ids as [string, string, string];
  turn(h, j, { x: 0, y: 0 }); // Antoine touche Julie
  turn(h, m, { x: 5, y: 5 }); // Julie rate Marc
  turn(h, a, { x: 5, y: 5 }); // Marc rate Antoine
  turn(h, j, { x: 1, y: 0 }); // Antoine coule Julie : elle devient fantôme
  return { h, a, j, m };
}

/**
 * La même table, avec des commandants : Antoine artificier, Julie au choix, Marc espion,
 * qui pose son leurre en D4 à sa première manche.
 */
function withCommanders(julie: string) {
  const h = new Harness(tinySettings({ commanders: [...COMMANDERS] }));
  const ids = ['Antoine', 'Julie', 'Marc'].map((name, i) => {
    const id = h.join(name, COLORS[i]!);
    h.place(id, TINY_FLEET);
    h.expectOk(player(id), {
      type: 'CHOOSE_COMMANDER',
      commanderId: [`artificier`, julie, 'espion'][i]!,
    });
    h.ready(id);
    return id;
  });
  h.start();
  const [a, j, m] = ids as [string, string, string];
  turn(h, j, { x: 0, y: 0 });
  turn(h, m, { x: 5, y: 5 });
  h.expectOk(player(m), { type: 'USE_ABILITY', targetId: m, coord: { x: 3, y: 3 } });
  turn(h, j, { x: 1, y: 0 });
  return { h, a, j, m };
}

describe('fantômes : les cartes', () => {
  it('prête dès la manche qui suit l’élimination, au choix sans commandant', () => {
    const { h, a, j } = withGhost();
    expect(projectPrivate(h.state, j).me.ghostCards).toEqual(['wisp', 'barrage', 'low_tide']);
    expect(projectPublic(h.state).players.find((p) => p.playerId === j)?.ghostReadyAt).toBe(4);
    expect(projectPrivate(h.state, a).me.ghostCards).toEqual([]);
  });

  it('le barrage tire une case cachée chez chaque survivant, après le tir de la manche', () => {
    const { h, a, j, m } = withGhost();
    expect(play(h, j, 'barrage').ok).toBe(true);
    expect(projectPrivate(h.state, j).me.ghostPlay).toEqual({ card: 'barrage' });
    expect(projectPrivate(h.state, j).me.ghostCards).toEqual([]);
    const events = turn(h, a, { x: 4, y: 4 }); // Marc rate Antoine
    expect(h.types(events).slice(0, 4)).toEqual([
      'SHOT_RESOLVED',
      'GHOST_CARD_PLAYED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
    ]);
    // Deux survivants, tour par tour : la carte suivante dans deux tours de table.
    expect(events[1]).toMatchObject({ playerId: j, card: 'barrage', readyAt: 4 + 2 * 2 });
    const barrage = ofType(events, 'SHOT_RESOLVED').filter((s) => s.barrage);
    expect(barrage.map((s) => s.targetId).sort()).toEqual([a, m].sort());
    for (const s of barrage) {
      expect(s).toMatchObject({ shooterId: j, barrage: { size: 2 } });
      // Jamais sur la case que le tir de la manche vient de révéler.
      expect(s.targetId === a && sameCoord(s.coord, { x: 4, y: 4 })).toBe(false);
    }
    expect(projectPrivate(h.state, j).me.ghostCards).toEqual([]);
    assertNoLeak(h.state);
  });

  it('la marée basse découvre chez chaque survivant une vraie case de navire, pas un leurre', () => {
    const { h, a, j, m } = withCommanders('ingenieur');
    expect(projectPrivate(h.state, j).me.ghostCards).toEqual(['low_tide']);
    expect(play(h, j, 'low_tide').ok).toBe(true);
    const lit = ofType(turn(h, a, { x: 4, y: 4 }), 'CELLS_LIT')[0]!;
    expect(lit).toMatchObject({ playerId: j, card: 'low_tide' });
    expect(lit.cells.map((c) => c.targetId).sort()).toEqual([a, m].sort());
    for (const c of lit.cells) {
      const owner = h.state.players.find((p) => p.playerId === c.targetId)!;
      expect(c.ship).toBe(true);
      expect(owner.fleet.some((s) => s.cells.some((x) => sameCoord(x, c.coord)))).toBe(true);
    }
    const marc = projectPublic(h.state).players.find((p) => p.playerId === m)!;
    expect(marc.lit).toHaveLength(1);
    expect(sameCoord(marc.lit[0]!.coord, { x: 3, y: 3 })).toBe(false);
  });

  it('le feu follet éclaire la case visée pour tous, et un leurre y passe pour un navire', () => {
    const { h, a, j, m } = withCommanders('amiral');
    expect(projectPrivate(h.state, j).me.ghostCards).toEqual(['wisp']);
    expect(play(h, j, 'barrage')).toMatchObject({
      ok: false,
      rejection: { code: 'GHOST_CARD_UNAVAILABLE' },
    });
    const [committed] = h.expectOk(player(j), {
      type: 'PLAY_GHOST_CARD',
      round: h.state.round!.index,
      card: 'wisp',
      targetId: m,
      coord: { x: 3, y: 3 },
    });
    // Le feu follet vise en secret jusqu'à la fin de la manche.
    expect(privateRecipient(committed!)).toBe(j);
    expect(publicEvent(committed!)).toEqual({
      type: 'GHOST_CARD_COMMITTED',
      round: committed!.type === 'GHOST_CARD_COMMITTED' ? committed!.round : -1,
      playerId: j,
      card: 'wisp',
    });
    const lit = ofType(turn(h, a, { x: 4, y: 4 }), 'CELLS_LIT')[0]!;
    expect(lit.cells).toEqual([{ targetId: m, coord: { x: 3, y: 3 }, ship: true }]);
    expect(privateRecipient(lit)).toBeNull();
  });

  it('le feu follet sur l’eau la montre comme de l’eau, et les bots ne la tirent plus', () => {
    const { h, a, j, m } = withGhost();
    play(h, j, 'wisp', { targetId: m, coord: { x: 2, y: 2 } });
    turn(h, a, { x: 4, y: 4 }); // Marc rate Antoine
    const marc = projectPublic(h.state).players.find((p) => p.playerId === m)!;
    expect(marc.lit).toEqual([{ coord: { x: 2, y: 2 }, ship: false }]);
    // Antoine, bot ou non, n'y voit plus qu'une case à ne pas tirer, même au hasard.
    const view = projectPrivate(h.state, a);
    for (let seed = 1; seed <= 60; seed++) {
      const shot = chooseShot(view, mulberry32(seed), 'easy');
      expect(shot && shot.targetId === m && sameCoord(shot.coord, { x: 2, y: 2 })).toBe(false);
    }
  });

  it('refuse une carte hors de propos', () => {
    const { h, a, j, m } = withGhost();
    expect(play(h, a, 'barrage')).toMatchObject({ ok: false, rejection: { code: 'NOT_A_GHOST' } });
    expect(h.run(player(j), { type: 'PLAY_GHOST_CARD', round: 3, card: 'barrage' })).toMatchObject({
      ok: false,
      rejection: { code: 'WRONG_STATE' },
    });
    expect(play(h, j, 'wisp')).toMatchObject({ ok: false, rejection: { code: 'BAD_REQUEST' } });
    expect(play(h, j, 'wisp', { targetId: a, coord: { x: 5, y: 5 } })).toMatchObject({
      ok: false,
      rejection: { code: 'CELL_ALREADY_SHOT' },
    });
    expect(play(h, j, 'wisp', { targetId: j, coord: { x: 3, y: 3 } })).toMatchObject({
      ok: false,
      rejection: { code: 'TARGET_NOT_ALIVE' },
    });
    expect(play(h, j, 'wisp', { targetId: m, coord: { x: 9, y: 9 } })).toMatchObject({
      ok: false,
      rejection: { code: 'COORD_OUT_OF_BOUNDS' },
    });
    expect(play(h, j, 'low_tide').ok).toBe(true);
    expect(play(h, j, 'barrage')).toMatchObject({
      ok: false,
      rejection: {
        code: 'GHOST_CARD_UNAVAILABLE',
        message: 'Ta carte est déjà jouée pour cette manche.',
      },
    });
    turn(h, a, { x: 4, y: 4 });
    expect(play(h, j, 'barrage')).toMatchObject({
      ok: false,
      rejection: { code: 'GHOST_CARD_UNAVAILABLE', message: 'Ta carte n’est pas encore prête.' },
    });
    // Le feu follet ne revient pas sur une case déjà éclairée.
    const litCell = h.state.players.find((p) => p.playerId === m)!.lit[0]!.coord;
    while (projectPrivate(h.state, j).me.ghostCards.length === 0) {
      const target = h.active === a ? m : a;
      turn(h, target, freeCells(h, target).at(-1)!); // Loin des torpilleurs, posés en haut à gauche.
    }
    expect(play(h, j, 'wisp', { targetId: m, coord: litCell })).toMatchObject({
      ok: false,
      rejection: { code: 'CELL_ALREADY_SHOT', message: 'Cette case est déjà éclairée.' },
    });
  });

  it('un barrage qui coule les deux derniers survivants finit la partie à égalité', () => {
    const buoy = { type: 'buoy', size: 1 };
    const fleet: ShipPlacement[] = [{ type: 'buoy', bow: { x: 0, y: 0 }, orientation: 'H' }];
    const { h, ids } = startedGame(3, tinySettings({ fleet: [buoy] }), fleet);
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 0 }); // Antoine coule la bouée de Julie
    // Antoine et Marc vident l'eau l'un de l'autre : il ne leur reste que leur bouée. Un
    // joueur dont l'adversaire n'a plus que sa bouée passe son tour.
    while (freeCount(h, a) > 1 || freeCount(h, m) > 1) {
      const target = h.active === a ? m : a;
      if (freeCount(h, target) > 1) turn(h, target, freeCell(h, target, { x: 0, y: 0 }));
      else h.expectOk(HOST, { type: 'FORCE_ROUND' });
    }
    // La manche passe sans tir : seul le barrage part, et coule les deux bouées.
    expect(play(h, j, 'barrage').ok).toBe(true);
    const events = h.expectOk(HOST, { type: 'FORCE_ROUND' });
    expect(h.types(events)).toEqual([
      'GHOST_CARD_PLAYED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
      'PLAYER_ELIMINATED',
      'PLAYER_ELIMINATED',
      'ROUND_RESOLVED',
      'GAME_FINISHED',
    ]);
    const finished = ofType(h.events, 'GAME_FINISHED')[0];
    expect(finished?.winnerId).toBeNull();
    expect(finished?.ranking.map((r) => [r.playerId, r.rank])).toEqual(
      expect.arrayContaining([
        [a, 1],
        [m, 1],
        [j, 3],
      ]),
    );
  });

  it('le bot fantôme joue sa carte dès qu’elle est prête, son feu follet sur une case cachée', () => {
    const { h, j, m } = withCommanders('sonariste');
    const choice = chooseGhostCard(projectPrivate(h.state, j), () => 0.5);
    expect(choice?.card).toBe('wisp');
    const target = h.state.players.find((p) => p.playerId === choice!.targetId)!;
    expect(target.status).toBe('ALIVE');
    expect(target.shotsReceived.some((s) => sameCoord(s.coord, choice!.coord!))).toBe(false);
    expect([m, h.state.players[0]!.playerId]).toContain(choice!.targetId);
    const free = withGhost();
    expect(chooseGhostCard(projectPrivate(free.h.state, free.j), () => 0.5)).toEqual({
      card: 'barrage',
    });
  });

  it('deux feux follets sur la même case : le second s’éteint', () => {
    const { h, ids } = startedGame(4, tinySettings(), TINY_FLEET);
    const [a, j, m, s] = ids as [string, string, string, string];
    for (const [target, x, y] of [
      [j, 0, 0],
      [m, 5, 5],
      [a, 5, 5],
      [a, 5, 4],
      [j, 1, 0], // Julie coulée
      [a, 5, 3],
      [a, 5, 2],
      [m, 0, 0],
      [s, 5, 5],
      [a, 4, 5],
      [m, 1, 0], // Marc coulé
    ] as const)
      turn(h, target, { x, y });
    const aim = { targetId: s, coord: { x: 3, y: 3 } };
    expect(play(h, j, 'wisp', aim).ok).toBe(true);
    expect(play(h, m, 'wisp', aim).ok).toBe(true);
    const lit = ofType(turn(h, a, { x: 4, y: 4 }), 'CELLS_LIT');
    expect(lit.map((e) => [e.playerId, e.cells.length])).toEqual([
      [j, 1],
      [m, 0],
    ]);
    expect(h.state.players.find((p) => p.playerId === s)!.lit).toHaveLength(1);
  });

  it('le souffle du fantôme suit la cadence de l’écran central', () => {
    expect(ghostLeadMs(2500)).toBe(400);
    expect(ghostLeadMs(0)).toBe(0);
  });

  it('une partie journalisée avec FORCE_ROUND garde les cartes engagées', () => {
    const { h, j } = withGhost();
    play(h, j, 'low_tide');
    const events = h.expectOk(HOST, { type: 'FORCE_ROUND' });
    expect(h.types(events)).toContain('CELLS_LIT');
  });
});

/** Les cases encore cachées chez un joueur. */
function freeCells(h: Harness, playerId: string) {
  const p = h.state.players.find((x) => x.playerId === playerId)!;
  const taken = new Set(p.shotsReceived.map((s) => coordKey(s.coord)));
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) if (!taken.has(coordKey({ x, y }))) out.push({ x, y });
  return out;
}
function freeCount(h: Harness, playerId: string) {
  return freeCells(h, playerId).length;
}
/** Une case cachée chez ce joueur, en évitant `avoid` tant qu'il reste autre chose. */
function freeCell(h: Harness, playerId: string, avoid?: { x: number; y: number }) {
  const free = freeCells(h, playerId);
  return free.find((c) => !avoid || !sameCoord(c, avoid)) ?? free[0]!;
}
