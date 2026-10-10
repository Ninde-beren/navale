import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Command, Coord, GameEvent, GameSettings } from '@navale/protocol';
import { chooseAction, densestCells } from '../src/battleship/bot/strategy.js';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import {
  privateRecipient,
  projectPrivate,
  projectPublic,
  publicEvent,
} from '../src/battleship/project.js';
import { statsOf } from '../src/battleship/rules/end.js';
import { antiFocusBlocked } from '../src/battleship/rules/targets.js';
import { COMMANDERS, makeSettings } from '../src/battleship/settings.js';
import { cellsRemaining, coordKey, type GameState } from '../src/battleship/state.js';
import { mulberry32 } from '../src/core/random.js';
import { randomFleet } from '../src/battleship/placement.js';
import { COLORS, FIXED_QUICK, HOST, Harness, player } from './helpers.js';
import { assertNoLeak } from './leak.js';

const settings = (over: Partial<GameSettings> = {}) =>
  makeSettings(
    { variant: 'sequential', maxPlayers: 2, commanders: [...COMMANDERS], ...over },
    'quick',
  );

/** Des joueurs prêts avec la flotte fixe (navires sur les lignes 1, 3, 5 et 7, à gauche), chacun son commandant. */
function game(commanderIds: string[], over: Partial<GameSettings> = {}) {
  const h = new Harness(settings({ maxPlayers: Math.max(2, commanderIds.length), ...over }));
  const names = ['Antoine', 'Julie', 'Marc', 'Sophie'];
  const ids = commanderIds.map((commanderId, i) => {
    const id = h.join(names[i]!, COLORS[i]!);
    h.expectOk(player(id), { type: 'CHOOSE_COMMANDER', commanderId });
    h.place(id, FIXED_QUICK);
    h.ready(id);
    return id;
  });
  h.start();
  return { h, ids };
}

const use = (h: Harness, who: string, targetId: string, coord: Coord) =>
  h.expectOk(player(who), { type: 'USE_ABILITY', targetId, coord });
/** Les cases que la carte de probabilités du bot difficile de `me` place en tête chez `target`. */
const densest = (h: Harness, me: string, target: string) => {
  const view = projectPrivate(h.state, me);
  return densestCells(
    view,
    view.players.find((p) => p.playerId === target)!,
  ).map(coordKey);
};
const pub = (h: Harness, id: string) =>
  projectPublic(h.state).players.find((p) => p.playerId === id)!;

describe('sonar', () => {
  it('ne dit que combien de cases de navire, sur une zone plus grande, et à son auteur seulement', () => {
    const { h, ids } = game(['sonariste', 'amiral']);
    const [a, j] = ids as [string, string];
    // Zone 5 × 5 autour de C3 : 4 cases du croiseur, 3 et 3 des contre-torpilleurs.
    const events = use(h, a, j, { x: 2, y: 2 });
    const radar = events.find((e) => e.type === 'RADAR_RESULT')!;
    expect(radar).toMatchObject({ ability: 'sonar', size: 5, shipCells: 10 });
    expect(radar).not.toHaveProperty('contacts');
    expect(publicEvent(radar)).not.toHaveProperty('shipCells');
    expect(projectPrivate(h.state, a).me.radarResults[0]).toMatchObject({
      ability: 'sonar',
      shipCells: 10,
    });
    expect(projectPrivate(h.state, j).me.radarResults).toEqual([]);
  });
});

describe('bouclier', () => {
  const shotsOf = (events: GameEvent[]) =>
    events.flatMap((e) => (e.type === 'SHOT_RESOLVED' ? [e] : []));
  const shotOf = (events: GameEvent[]) => shotsOf(events)[0]!;
  const statsFor = (h: Harness, id: string) =>
    statsOf(
      h.state,
      h.state.players.find((p) => p.playerId === id)!,
    );

  it('en tour par tour : public et permanent, le premier tir sur une case la perce sans rien révéler, le deuxième passe', () => {
    const { h, ids } = game(['capitaine', 'amiral']);
    const [a, j] = ids as [string, string];
    expect(h.types(use(h, a, a, { x: 1, y: 1 }))).toEqual([
      'ABILITY_USED',
      'SHIELD_RAISED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    expect(pub(h, a).shield).toEqual({ center: { x: 1, y: 1 }, size: 3, pierced: [] });
    // Julie tire sous le bouclier, sur le croiseur d'Antoine : bloqué, rien n'est révélé.
    expect(shotOf(h.fire(j, a, { x: 0, y: 0 }))).toMatchObject({ result: 'BLOCKED', shooterId: j });
    expect(pub(h, a).revealed).toEqual([]);
    expect(cellsRemaining(h.state.players.find((p) => p.playerId === a)!)).toBe(12);
    expect(pub(h, a).shield).toEqual({
      center: { x: 1, y: 1 },
      size: 3,
      pierced: [{ x: 0, y: 0 }],
    });
    // Le tour d'Antoine passe, le bouclier tient ; la case percée se tire comme une autre.
    h.fire(a, j, { x: 7, y: 7 });
    expect(pub(h, a).shield).not.toBeNull();
    expect(shotOf(h.fire(j, a, { x: 0, y: 0 }))).toMatchObject({ result: 'HIT' });
    h.fire(a, j, { x: 6, y: 7 });
    // Sa voisine, elle, est encore protégée.
    expect(shotOf(h.fire(j, a, { x: 1, y: 0 }))).toMatchObject({ result: 'BLOCKED' });
    expect(statsFor(h, j)).toMatchObject({ shotsFired: 3, hits: 1 });
  });

  it('« bloqué » sort pareil sur l’eau et sur un navire : rien ne fuit', () => {
    const { h, ids } = game(['capitaine', 'amiral']);
    const [a, j] = ids as [string, string];
    use(h, a, a, { x: 1, y: 1 });
    const onShip = shotOf(h.fire(j, a, { x: 0, y: 0 })); // le croiseur
    h.fire(a, j, { x: 7, y: 7 });
    const onWater = shotOf(h.fire(j, a, { x: 0, y: 1 })); // de l'eau
    const strip = (e: GameEvent) => {
      const { coord: _c, round: _r, ...rest } = publicEvent(e) as typeof onShip;
      return rest;
    };
    expect(strip(onShip)).toEqual(strip(onWater));
    expect(pub(h, a).revealed).toEqual([]);
    expect(pub(h, a).shipsRemaining).toBe(4);
    assertNoLeak(h.state);
  });

  it('le missile : chaque case de la croix suit la même règle, et une croix toute protégée est bloquée, pas refusée', () => {
    const covered = game(['capitaine', 'artificier']);
    const [a, j] = covered.ids as [string, string];
    use(covered.h, a, a, { x: 1, y: 1 });
    const all = shotsOf(use(covered.h, j, a, { x: 1, y: 1 }));
    expect(all).toHaveLength(5);
    expect(all.every((s) => s.result === 'BLOCKED')).toBe(true);
    expect(pub(covered.h, a).shield?.pierced).toHaveLength(5);

    const partial = game(['capitaine', 'artificier']);
    use(partial.h, a, a, { x: 1, y: 1 });
    // Autour de C3 : C3, B3 et C2 sont protégées ; D3 et C4 sont de l'eau.
    const burst = shotsOf(use(partial.h, j, a, { x: 2, y: 2 }));
    expect(burst.map((s) => [s.coord, s.result])).toEqual([
      [{ x: 2, y: 2 }, 'BLOCKED'],
      [{ x: 1, y: 2 }, 'BLOCKED'],
      [{ x: 3, y: 2 }, 'MISS'],
      [{ x: 2, y: 1 }, 'BLOCKED'],
      [{ x: 2, y: 3 }, 'MISS'],
    ]);
  });

  it('en salve : tous les tirs d’une manche sur une même case protégée sont bloqués, puis la case est percée', () => {
    const { h, ids } = game(['capitaine', 'artificier', 'amiral'], { variant: 'simultaneous' });
    const [a, j, m] = ids as [string, string, string];
    h.fire(j, a, { x: 0, y: 0 }); // Julie et Marc visent le croiseur d'Antoine…
    h.fire(m, a, { x: 0, y: 0 });
    const resolved = use(h, a, a, { x: 1, y: 1 }); // … qui lève son bouclier dessus
    expect(shotsOf(resolved).map((s) => [s.shooterId, s.result])).toEqual([
      [j, 'BLOCKED'],
      [m, 'BLOCKED'],
    ]);
    expect(pub(h, a).revealed).toEqual([]);
    expect(pub(h, a).shield?.pierced).toEqual([{ x: 0, y: 0 }]);
    h.fire(a, j, { x: 7, y: 7 });
    h.fire(j, a, { x: 0, y: 0 });
    const next = shotsOf(h.fire(m, a, { x: 0, y: 1 }));
    expect(next.map((s) => [s.shooterId, s.result])).toEqual([
      [a, 'MISS'],
      [j, 'HIT'],
      [m, 'BLOCKED'],
    ]);
  });

  it('un tir bloqué compte pour l’anti-acharnement', () => {
    const { h, ids } = game(['capitaine', 'amiral', 'artificier'], { antiFocusMaxStreak: 1 });
    const [a, j] = ids as [string, string, string];
    use(h, a, a, { x: 1, y: 1 });
    expect(shotOf(h.fire(j, a, { x: 0, y: 0 }))).toMatchObject({ result: 'BLOCKED' });
    expect(antiFocusBlocked(h.state, j)).toBe(a);
  });
});

describe('leurre', () => {
  it('se pose en secret, trompe le radar, et le premier tir dessus est annoncé touché sans rien abîmer', () => {
    const { h, ids } = game(['espion', 'amiral']);
    const [a, j] = ids as [string, string];
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: j, coord: { x: 6, y: 1 } },
      'WRONG_STATE',
    );
    h.expectReject(
      player(a),
      { type: 'USE_ABILITY', targetId: a, coord: { x: 0, y: 0 } },
      'CELL_NOT_FREE',
    );
    const events = use(h, a, a, { x: 6, y: 1 });
    const used = events.find((e) => e.type === 'ABILITY_USED')!;
    const placed = events.find((e) => e.type === 'DECOY_PLACED')!;
    for (const e of [used, placed]) {
      expect(publicEvent(e)).not.toHaveProperty('coord');
      expect(privateRecipient(e)).toBe(a);
    }
    expect(publicEvent(used)).toMatchObject({
      type: 'ABILITY_USED',
      playerId: a,
      ability: 'decoy',
    });
    expect(projectPrivate(h.state, a).me.decoys).toEqual([{ x: 6, y: 1 }]);
    expect(projectPrivate(h.state, j).me.decoys).toEqual([]);
    expect(JSON.stringify(projectPublic(h.state))).not.toContain('"x":6,"y":1');
    // Le radar de Julie le prend pour un navire.
    const radar = use(h, j, a, { x: 6, y: 1 }).find((e) => e.type === 'RADAR_RESULT')!;
    expect(radar).toMatchObject({ contacts: [{ x: 6, y: 1 }], shipCells: 1 });
    h.fire(a, j, { x: 7, y: 7 });
    const shot = h.fire(j, a, { x: 6, y: 1 }).find((e) => e.type === 'SHOT_RESOLVED')!;
    expect(shot).toMatchObject({ result: 'HIT', coord: { x: 6, y: 1 } });
    const me = h.state.players.find((p) => p.playerId === a)!;
    expect(cellsRemaining(me)).toBe(12);
    expect(pub(h, a).revealed).toEqual([{ coord: { x: 6, y: 1 }, result: 'HIT' }]);
  });
});

/** L'action d'un bot pour ce joueur, envoyée au moteur : elle doit toujours être acceptée. */
function botTurn(h: Harness, id: string, seed = 1, useAbilities = true): GameEvent[] {
  const action = chooseAction(
    projectPrivate(h.state, id),
    mulberry32(seed),
    'normal',
    useAbilities,
  );
  if (!action) throw new Error('le bot ne sait pas quoi jouer');
  const command: Command = action.ability
    ? { type: 'USE_ABILITY', targetId: action.targetId, coord: action.coord }
    : { type: 'FIRE', targetId: action.targetId, coord: action.coord };
  return h.expectOk(player(id), command);
}
const usedAbility = (events: GameEvent[]) => events.some((e) => e.type === 'ABILITY_USED');

describe('bots et capacités', () => {
  it('un bot ajouté tire son commandant au hasard parmi ceux de la partie', () => {
    const h = new Harness(settings());
    h.join('Antoine', 'red');
    const events = h.expectOk(HOST, { type: 'ADD_BOT' });
    const chosen = events.find((e) => e.type === 'COMMANDER_CHOSEN');
    expect(COMMANDERS.map((c) => c.id)).toContain(
      chosen?.type === 'COMMANDER_CHOSEN' && chosen.commanderId,
    );
  });

  it('répare ou protège dès qu’un de ses bateaux est touché', () => {
    for (const commander of ['ingenieur', 'capitaine']) {
      const { h, ids } = game([commander, 'amiral']);
      const [a, j] = ids as [string, string];
      expect(usedAbility(botTurn(h, a))).toBe(false); // rien à réparer ni à protéger : il tire
      h.fire(j, a, { x: 0, y: 0 });
      const events = botTurn(h, a);
      expect(usedAbility(events)).toBe(true);
      expect(events.find((e) => e.type === 'ABILITY_USED')).toMatchObject({
        targetId: a,
        coord: { x: 0, y: 0 },
      });
    }
  });

  it('tire sous un bouclier pour achever un navire, et revient sur la case qu’il a percée', () => {
    const { h, ids } = game(['capitaine', 'amiral']);
    const [a, j] = ids as [string, string];
    h.fire(a, j, { x: 7, y: 7 });
    h.fire(j, a, { x: 0, y: 0 }); // touche le croiseur d'Antoine, dans le coin
    use(h, a, a, { x: 1, y: 1 }); // qui le protège
    // Les seules suites possibles, B1 et A2, sont sous le bouclier : le bot y tire quand même.
    const first = botTurn(h, j).find((e) => e.type === 'SHOT_RESOLVED')!;
    expect(first).toMatchObject({ result: 'BLOCKED' });
    expect([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]).toContainEqual((first as Extract<GameEvent, { type: 'SHOT_RESOLVED' }>).coord);
    h.fire(a, j, { x: 6, y: 7 });
    const second = botTurn(h, j).find((e) => e.type === 'SHOT_RESOLVED')!;
    expect(second).toMatchObject({
      coord: (first as Extract<GameEvent, { type: 'SHOT_RESOLVED' }>).coord,
    });
    expect(second).not.toMatchObject({ result: 'BLOCKED' });
  });

  it('tire son missile sur une touche à achever', () => {
    const { h, ids } = game(['artificier', 'amiral']);
    const [a, j] = ids as [string, string];
    h.fire(a, j, { x: 1, y: 0 }); // touche le croiseur de Julie
    h.fire(j, a, { x: 7, y: 7 });
    const events = botTurn(h, a);
    expect(events.find((e) => e.type === 'ABILITY_USED')).toMatchObject({
      ability: 'missile',
      targetId: j,
      coord: { x: 1, y: 0 },
    });
  });

  it('passe son radar en chasse dès la deuxième manche, puis tire ce qu’il a vu', () => {
    const { h, ids } = game(['amiral', 'ingenieur']);
    const [a, j] = ids as [string, string];
    expect(usedAbility(botTurn(h, a, 3))).toBe(false); // première manche : il tire
    h.expectOk(HOST, { type: 'FORCE_ROUND' }); // Julie passe (et rien n'est touché chez elle)
    const wounded = h.state.players
      .find((p) => p.playerId === j)!
      .shotsReceived.some((s) => s.result === 'HIT');
    if (wounded) return; // le premier tir a touché : le bot achève, c'est le cas du missile
    expect(usedAbility(botTurn(h, a, 3))).toBe(true);
    h.expectOk(HOST, { type: 'FORCE_ROUND' });
    const radar = h.state.players.find((p) => p.playerId === a)!.radarResults[0]!;
    const shot = botTurn(h, a, 5).find((e) => e.type === 'SHOT_RESOLVED')!;
    if (radar.contacts && radar.contacts.length > 0)
      expect(radar.contacts).toContainEqual(
        (shot as Extract<GameEvent, { type: 'SHOT_RESOLVED' }>).coord,
      );
  });

  it('difficile : ne compte plus l’eau vue au radar, ni la zone d’un sonar qui ne trouve rien', () => {
    // Radar sur D4 chez Julie : deux contacts (C3, C5), sept cases d'eau au cœur de sa grille.
    const r = game(['amiral', 'ingenieur']);
    const [a, j] = r.ids as [string, string];
    const water = ['3,2', '4,2', '2,3', '3,3', '4,3', '3,4', '4,4'];
    expect(densest(r.h, a, j).some((key) => water.includes(key))).toBe(true);
    use(r.h, a, j, { x: 3, y: 3 });
    expect(densest(r.h, a, j).some((key) => water.includes(key))).toBe(false);

    // Sonar sur F6 : zéro case de navire dans la zone 5 × 5, D4 à H8.
    const s = game(['sonariste', 'ingenieur']);
    const [b, k] = s.ids as [string, string];
    const inZone = (key: string) => key.split(',').every((n) => Number(n) >= 3);
    expect(densest(s.h, b, k).some(inZone)).toBe(true);
    use(s.h, b, k, { x: 5, y: 5 });
    expect(densest(s.h, b, k).length).toBeGreaterThan(0);
    expect(densest(s.h, b, k).some(inZone)).toBe(false);
  });

  it('difficile : vise la zone d’un sonar qui compte plus de navires que prévu', () => {
    // Sonar sur B2 : sept cases de navire sur les seize de A1 à D4, bien plus que le hasard.
    const { h, ids } = game(['sonariste', 'ingenieur']);
    const [a, j] = ids as [string, string];
    const inZone = (key: string) => key.split(',').every((n) => Number(n) <= 3);
    expect(densest(h, a, j).every(inZone)).toBe(false);
    use(h, a, j, { x: 1, y: 1 });
    expect(densest(h, a, j).every(inZone)).toBe(true);
    // Un raté en D4, dans la zone : les sept cases de navire y sont toujours, elle attire encore.
    h.fire(j, a, { x: 7, y: 7 });
    h.fire(a, j, { x: 3, y: 3 });
    h.fire(j, a, { x: 7, y: 6 });
    expect(densest(h, a, j).every(inZone)).toBe(true);
    expect(densest(h, a, j)).not.toContain('3,3');
  });

  it('pose son leurre dès la deuxième manche, sur une case libre', () => {
    const { h, ids } = game(['espion', 'amiral']);
    const [a] = ids as [string, string];
    expect(usedAbility(botTurn(h, a))).toBe(false);
    h.expectOk(HOST, { type: 'FORCE_ROUND' });
    const events = botTurn(h, a);
    expect(events.find((e) => e.type === 'DECOY_PLACED')).toMatchObject({ playerId: a });
  });

  it('le relais d’un absent ne dépense jamais la capacité de celui qu’il remplace', () => {
    const { h, ids } = game(['ingenieur', 'amiral']);
    const [a, j] = ids as [string, string];
    h.fire(a, j, { x: 7, y: 7 });
    h.fire(j, a, { x: 0, y: 0 });
    expect(usedAbility(botTurn(h, a, 1, false))).toBe(false);
  });

  it('des bots commandants jouent des parties entières, sans action refusée ni fuite', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 2, max: 4 }),
        fc.constantFrom('sequential', 'simultaneous'),
        fc.integer({ min: 0, max: COMMANDERS.length - 1 }),
        (seed, players, variant, offset) => {
          const s = settings({
            maxPlayers: players,
            variant: variant as 'sequential' | 'simultaneous',
          });
          const h = new Harness(s, seed);
          const rnd = mulberry32(seed * 31);
          const ids: string[] = [];
          for (let i = 0; i < players; i++) {
            const id = h.join(`J${i}`, COLORS[i]!);
            h.expectOk(player(id), {
              type: 'CHOOSE_COMMANDER',
              commanderId: COMMANDERS[(offset + i) % COMMANDERS.length]!.id,
            });
            h.place(id, randomFleet(s, rnd));
            h.ready(id);
            ids.push(id);
          }
          h.start();
          let state: GameState = initialState({
            gameId: 'g1',
            code: 'ABCD',
            settings: s,
            createdAt: 0,
          });
          for (let n = 0; h.state.status === 'PLAYING' && n < 3000; n++) {
            const round = h.state.round!;
            const shooter = round.expectedShooters.find((id) => !round.committed[id]);
            const action = shooter && chooseAction(projectPrivate(h.state, shooter), rnd);
            if (!shooter || !action) {
              h.expectOk(HOST, { type: 'FORCE_ROUND' });
              continue;
            }
            h.expectOk(
              player(shooter),
              action.ability
                ? { type: 'USE_ABILITY', targetId: action.targetId, coord: action.coord }
                : { type: 'FIRE', targetId: action.targetId, coord: action.coord },
            );
          }
          expect(h.state.status).toBe('FINISHED');
          for (const e of h.events) {
            state = evolve(state, e);
            assertNoLeak(state);
          }
          expect(state).toEqual(h.state);
        },
      ),
      { numRuns: 30 },
    );
  });
});
