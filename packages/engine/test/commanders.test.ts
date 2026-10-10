import { describe, expect, it } from 'vitest';
import type { Commander, Coord, GameEvent, GameSettings } from '@navale/protocol';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import {
  privateRecipient,
  projectPrivate,
  projectPublic,
  publicEvent,
} from '../src/battleship/project.js';
import { rematchEvents } from '../src/battleship/rematch.js';
import { radarZone, missileCells, repairableCells } from '../src/battleship/rules/abilities.js';
import { antiFocusBlocked } from '../src/battleship/rules/targets.js';
import { COMMANDERS, makeSettings } from '../src/battleship/settings.js';
import { cellsRemaining } from '../src/battleship/state.js';
import { FIXED_QUICK, HOST, Harness, player } from './helpers.js';

const settings = (over: Partial<GameSettings> = {}) =>
  makeSettings(
    { variant: 'sequential', maxPlayers: 2, commanders: [...COMMANDERS], ...over },
    'quick',
  );

/** Deux joueurs prêts avec la flotte fixe, chacun son commandant, partie lancée. */
function game(commanderIds: string[], over: Partial<GameSettings> = {}) {
  const h = new Harness(settings(over));
  const names = ['Antoine', 'Julie', 'Marc'];
  const colors = ['red', 'yellow', 'blue'] as const;
  const ids = commanderIds.map((commanderId, i) => {
    const id = h.join(names[i]!, colors[i]!);
    h.expectOk(player(id), { type: 'CHOOSE_COMMANDER', commanderId });
    h.place(id, FIXED_QUICK);
    h.ready(id);
    return id;
  });
  h.start();
  return { h, ids };
}

const miss = (h: Harness, shooter: string, target: string, coord: Coord = { x: 7, y: 7 }) =>
  h.fire(shooter, target, coord);

describe('commandants : le choix', () => {
  it('se fait au lobby, parmi ceux de la partie, et avant de se déclarer prêt', () => {
    const h = new Harness(settings());
    const a = h.join('Antoine', 'red');
    h.place(a, FIXED_QUICK);
    h.expectReject(player(a), { type: 'SET_READY', ready: true }, 'COMMANDER_MISSING');
    h.expectReject(
      player(a),
      { type: 'CHOOSE_COMMANDER', commanderId: 'pirate' },
      'COMMANDER_UNKNOWN',
    );
    expect(h.expectOk(player(a), { type: 'CHOOSE_COMMANDER', commanderId: 'amiral' })).toEqual([
      { type: 'COMMANDER_CHOSEN', playerId: a, commanderId: 'amiral' },
    ]);
    expect(h.expectOk(player(a), { type: 'CHOOSE_COMMANDER', commanderId: 'amiral' })).toEqual([]);
    h.ready(a);
    const me = projectPublic(h.state).players[0]!;
    expect(me.commanderId).toBe('amiral');
    expect(me.abilityUsesLeft).toBe(1);
    // Un bot n'en a pas, et la partie peut se lancer avec lui.
    h.expectOk(HOST, { type: 'ADD_BOT' });
    expect(projectPublic(h.state).players[1]!.commanderId).toBeNull();
    h.start();
    h.expectReject(
      player(a),
      { type: 'CHOOSE_COMMANDER', commanderId: 'ingenieur' },
      'WRONG_STATE',
    );
  });

  it('est refusé dans une partie sans commandants, où l’on est prêt sans en choisir', () => {
    const h = new Harness(makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'));
    const a = h.join('Antoine', 'red');
    h.expectReject(player(a), { type: 'CHOOSE_COMMANDER', commanderId: 'amiral' }, 'WRONG_STATE');
    h.place(a, FIXED_QUICK);
    h.ready(a);
    expect(projectPrivate(h.state, a).me.canUseAbility).toBe(false);
  });
});

describe('capacités, en tour par tour', () => {
  it('le radar compte les cases de navire d’une zone, pour son auteur seulement', () => {
    const { h, ids } = game(['amiral', 'artificier']);
    const [a, j] = ids as [string, string];
    expect(projectPrivate(h.state, a).me.canUseAbility).toBe(true);
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: a, coord: { x: 1, y: 1 } },
      'TARGET_IS_SELF',
    );
    h.expectReject(
      player(j),
      { type: 'USE_ABILITY', targetId: a, coord: { x: 1, y: 1 } },
      'NOT_YOUR_TURN',
    );
    // Zone 3×3 autour de B2 chez Julie : trois cases du croiseur (ligne 1) et trois du contre-torpilleur (ligne 3).
    const events = h.expectOk(player(a), {
      type: 'USE_ABILITY',
      targetId: j,
      coord: { x: 1, y: 1 },
    });
    expect(h.types(events)).toEqual([
      'ABILITY_USED',
      'RADAR_RESULT',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    const radar = events[1] as Extract<GameEvent, { type: 'RADAR_RESULT' }>;
    expect(radar).toMatchObject({
      playerId: a,
      targetId: j,
      center: { x: 1, y: 1 },
      size: 3,
      shipCells: 6,
    });
    expect(radar.contacts).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
    expect(publicEvent(radar)).not.toHaveProperty('shipCells');
    expect(publicEvent(radar)).not.toHaveProperty('contacts');
    expect(privateRecipient(radar)).toBe(a);
    expect(projectPrivate(h.state, a).me.radarResults).toEqual([
      {
        round: 0,
        targetId: j,
        center: { x: 1, y: 1 },
        size: 3,
        shipCells: 6,
        contacts: radar.contacts,
      },
    ]);
    expect(projectPrivate(h.state, j).me.radarResults).toEqual([]);
    expect(projectPublic(h.state).players[0]!.abilityUsesLeft).toBe(0);
    expect(h.state.shotsLog).toHaveLength(0); // le radar ne tire pas
    // Le tour est passé ; au suivant, plus de capacité, mais le tir reste possible.
    expect(h.active).toBe(j);
    miss(h, j, a);
    expect(projectPrivate(h.state, a).me.canUseAbility).toBe(false);
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: j, coord: { x: 0, y: 0 } },
      'ABILITY_UNAVAILABLE',
    );
    expect(h.types(miss(h, a, j))).toContain('SHOT_RESOLVED');
  });

  it('la zone du radar est rognée par la grille', () => {
    const s = settings();
    expect(radarZone(s, { x: 0, y: 0 }, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(radarZone(s, { x: 4, y: 4 }, 1)).toEqual([{ x: 4, y: 4 }]);
    expect(missileCells(s, { x: 7, y: 0 })).toEqual([
      { x: 7, y: 0 },
      { x: 6, y: 0 },
      { x: 7, y: 1 },
    ]);
  });

  it('le missile frappe en croix, saute les cases déjà révélées, et ses tirs comptent', () => {
    const twice: Commander[] = COMMANDERS.map((c) =>
      c.id === 'artificier' ? { ...c, uses: 2 } : c,
    );
    const { h, ids } = game(['artificier', 'amiral'], { commanders: twice });
    const [a, j] = ids as [string, string];
    // Croix autour de B1 chez Julie : A1, B1, C1 touchent le croiseur, B2 rate ; B0 est hors grille.
    const events = h.expectOk(player(a), {
      type: 'USE_ABILITY',
      targetId: j,
      coord: { x: 1, y: 0 },
    });
    expect(h.types(events)).toEqual([
      'ABILITY_USED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    const results = h.state.shotsLog.map((s) => s.result);
    expect(results.filter((r) => r === 'HIT')).toHaveLength(3);
    expect(results.filter((r) => r === 'MISS')).toHaveLength(1);
    expect(h.state.shotsLog.every((s) => s.shooterId === a)).toBe(true);
    // Les quatre tirs forment une rafale : même centre, même taille, pour l'annoncer en une fois.
    expect(h.state.shotsLog.map((s) => s.burst)).toEqual(
      Array(4).fill({ center: { x: 1, y: 0 }, size: 4 }),
    );
    miss(h, j, a);
    // Second missile autour de B2 : B2 et B1 déjà révélées sont sautées ; A2, C2 ratent, B3 touche.
    const again = h.expectOk(player(a), {
      type: 'USE_ABILITY',
      targetId: j,
      coord: { x: 1, y: 1 },
    });
    expect(h.types(again).filter((t) => t === 'SHOT_RESOLVED')).toHaveLength(3);
    expect(h.state.shotsLog.slice(-3).every((s) => s.burst?.size === 3)).toBe(true);
    miss(h, j, a, { x: 6, y: 7 });
    // Le croiseur (A1–D1) a trois touches : un tir ordinaire en D1 le coule, au crédit d'Antoine.
    const sunk = h.fire(a, j, { x: 3, y: 0 });
    expect(sunk.find((e) => e.type === 'SHOT_RESOLVED')).toMatchObject({
      result: 'SUNK',
      shooterId: a,
    });
  });

  it('refuse une rafale dont toutes les cases sont déjà révélées', () => {
    const { h, ids } = game(['artificier', 'amiral']);
    const [a, j] = ids as [string, string];
    // Le coin H8 chez Julie : H8, G8 et H7, les trois cases de la croix, révélées une à une.
    const corner = [
      { x: 7, y: 7 },
      { x: 6, y: 7 },
      { x: 7, y: 6 },
    ];
    corner.forEach((c, i) => {
      h.fire(a, j, c);
      miss(h, j, a, { x: 7 - i, y: 7 });
    });
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: j, coord: { x: 7, y: 7 } },
      'CELL_ALREADY_SHOT',
    );
    expect(projectPrivate(h.state, a).me.canUseAbility).toBe(true); // l'usage n'est pas perdu
  });

  it('une rafale compte pour une seule action dans l’anti-acharnement', () => {
    const { h, ids } = game(['artificier', 'amiral', 'ingenieur'], {
      maxPlayers: 3,
      antiFocusMaxStreak: 2,
    });
    const [a, j, m] = ids as [string, string, string];
    h.expectOk(player(a), { type: 'USE_ABILITY', targetId: j, coord: { x: 5, y: 5 } });
    expect(antiFocusBlocked(h.state, a)).toBeNull(); // cinq tirs, mais une action
    miss(h, j, m);
    miss(h, m, j);
    miss(h, a, j, { x: 6, y: 7 }); // deuxième action de suite sur Julie : encore permise
    expect(antiFocusBlocked(h.state, a)).toBe(j);
  });

  it('la réparation remet une case en état, seulement sur un bateau à flot', () => {
    const { h, ids } = game(['ingenieur', 'amiral']);
    const [a, j] = ids as [string, string];
    miss(h, a, j);
    h.fire(j, a, { x: 0, y: 0 }); // Julie touche le croiseur d'Antoine en A1
    miss(h, a, j, { x: 6, y: 7 });
    h.fire(j, a, { x: 0, y: 6 }); // puis le torpilleur en A7…
    miss(h, a, j, { x: 5, y: 7 });
    h.fire(j, a, { x: 1, y: 6 }); // …et le coule en B7
    expect(cellsRemaining(h.state.players[0]!)).toBe(9);
    expect(repairableCells(h.state.players[0]!.fleet)).toEqual([{ x: 0, y: 0 }]);
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: j, coord: { x: 0, y: 0 } },
      'WRONG_STATE',
    );
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: a, coord: { x: 0, y: 6 } },
      'CELL_NOT_REPAIRABLE',
    );
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: a, coord: { x: 5, y: 5 } },
      'CELL_NOT_REPAIRABLE',
    );
    const events = h.expectOk(player(a), {
      type: 'USE_ABILITY',
      targetId: a,
      coord: { x: 0, y: 0 },
    });
    expect(h.types(events)).toEqual([
      'ABILITY_USED',
      'SHIP_REPAIRED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    expect(cellsRemaining(h.state.players[0]!)).toBe(10);
    // La case redevient inconnue pour tout le monde : Julie peut la retirer.
    expect(
      projectPublic(h.state).players[0]!.revealed.some((r) => r.coord.x === 0 && r.coord.y === 0),
    ).toBe(false);
    expect(h.types(h.fire(j, a, { x: 0, y: 0 }))).toContain('SHOT_RESOLVED');
    expect(cellsRemaining(h.state.players[0]!)).toBe(9);
  });
});

describe('capacités, en salve', () => {
  it('se résolvent avant les tirs, dans l’ordre d’engagement, et à la manche forcée aussi', () => {
    const { h, ids } = game(['amiral', 'ingenieur'], { variant: 'simultaneous' });
    const [a, j] = ids as [string, string];
    // Manche 0 : Antoine engage son radar, Julie tire ; la salve se résout au dernier engagé.
    const sealed = h.expectOk(player(a), {
      type: 'USE_ABILITY',
      targetId: j,
      coord: { x: 1, y: 1 },
    });
    expect(sealed).toEqual([
      {
        type: 'SHOT_COMMITTED',
        round: 0,
        shooterId: a,
        targetId: j,
        coord: { x: 1, y: 1 },
        ability: 'radar',
      },
    ]);
    expect(publicEvent(sealed[0]!)).toEqual({
      type: 'SHOT_COMMITTED',
      round: 0,
      shooterId: a,
      ability: 'radar',
    });
    expect(projectPrivate(h.state, a).me.pendingShot).toEqual({
      targetId: j,
      coord: { x: 1, y: 1 },
      ability: 'radar',
    });
    const resolved = h.fire(j, a, { x: 0, y: 0 });
    expect(h.types(resolved)).toEqual([
      'SHOT_COMMITTED',
      'ABILITY_USED',
      'RADAR_RESULT',
      'SHOT_RESOLVED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    expect(projectPrivate(h.state, a).me.radarResults[0]?.shipCells).toBe(6);
    // Manche 1 : Antoine touche le croiseur de Julie en A1, Julie rate.
    h.fire(a, j, { x: 0, y: 0 });
    miss(h, j, a);
    expect(cellsRemaining(h.state.players[1]!)).toBe(11);
    // Manche 2 : Julie répare A1 pendant qu'Antoine rate ; la réparation précède le tir.
    h.expectOk(player(j), { type: 'USE_ABILITY', targetId: j, coord: { x: 0, y: 0 } });
    const second = miss(h, a, j);
    expect(h.types(second)).toEqual([
      'SHOT_COMMITTED',
      'ABILITY_USED',
      'SHIP_REPAIRED',
      'SHOT_RESOLVED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    expect(cellsRemaining(h.state.players[1]!)).toBe(12);
    // Manche 3 : rien d'engagé par Julie, la manche forcée résout quand même le tir d'Antoine.
    h.fire(a, j, { x: 7, y: 6 });
    const forced = h.expectOk(HOST, { type: 'FORCE_ROUND' });
    expect(h.types(forced)).toEqual(['SHOT_RESOLVED', 'ROUND_RESOLVED', 'ROUND_STARTED']);
    expect((forced[1] as Extract<GameEvent, { type: 'ROUND_RESOLVED' }>).skipped).toEqual([j]);
  });
});

describe('commandants : la revanche', () => {
  it('garde le commandant de chacun, usages remis à neuf', () => {
    const { h, ids } = game(['amiral', 'artificier']);
    const [a, j] = ids as [string, string];
    h.expectOk(player(a), { type: 'USE_ABILITY', targetId: j, coord: { x: 1, y: 1 } });
    let next = initialState({
      gameId: 'g2',
      code: 'ABCD',
      settings: h.state.settings,
      createdAt: 0,
    });
    for (const e of rematchEvents(h.state, 'g2', h.ctx(HOST))) next = evolve(next, e);
    expect(next.players.map((p) => [p.commanderId, p.abilityUsesLeft])).toEqual([
      ['amiral', 1],
      ['artificier', 1],
    ]);
    expect(next.players.every((p) => p.radarResults.length === 0)).toBe(true);
  });
});
