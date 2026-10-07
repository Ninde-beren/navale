import { describe, expect, it } from 'vitest';
import {
  battleship,
  evolve,
  initialState,
  makeSettings,
  randomFleet,
  mulberry32,
  pick,
} from '../src/index.js';
import { HOST, Harness, TINY_FLEET, player, startedGame, tinySettings, turn } from './helpers.js';

describe('cas limites', () => {
  it('le barrel expose la définition du jeu, utilisable par la coquille', () => {
    const settings = makeSettings({ variant: 'sequential', maxPlayers: 2 });
    let state = battleship.initialState({ gameId: 'g', code: 'ZZZZ', settings, createdAt: 5 });
    state = battleship.evolve(state, {
      type: 'GAME_CREATED',
      gameId: 'g2',
      code: 'YYYY',
      settings,
      createdAt: 7,
    });
    expect(state).toMatchObject({ gameId: 'g2', code: 'YYYY', createdAt: 7, seq: 1 });
    expect(battleship.isFinished(state)).toBe(false);
    expect(battleship.nextDeadline(state)).toBeNull();
    expect(battleship.projectPublic(state).players).toEqual([]);
    expect(
      battleship.evolve(state, { type: 'REMATCH_CREATED', newGameId: 'g3', code: 'XXXX' }),
    ).toMatchObject({ gameId: 'g2', seq: 2 });
  });

  it('REMATCH est refusé par le moteur et REQUEST_SNAPSHOT ne produit rien', () => {
    const { h, ids } = startedGame(2);
    h.expectReject(HOST, { type: 'REMATCH' }, 'WRONG_STATE');
    expect(h.expectOk(player(ids[0]!), { type: 'REQUEST_SNAPSHOT' })).toEqual([]);
  });

  it('expose l’échéance de la manche en cours', () => {
    const { h } = startedGame(
      2,
      makeSettings({ variant: 'simultaneous', maxPlayers: 2, roundTimerSeconds: 45 }, 'quick'),
    );
    expect(battleship.nextDeadline(h.state)).toBe(1_000 + 45_000);
  });

  it('classe à égalité deux vivants aux mêmes cases, bateaux et touches', () => {
    const { h, ids } = startedGame(
      3,
      tinySettings({ endCondition: 'first_fleet_sunk' }),
      TINY_FLEET,
    );
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 0 }); // A → J touché
    turn(h, a, { x: 5, y: 5 }); // J → A raté
    turn(h, a, { x: 4, y: 4 }); // M → A raté
    const events = turn(h, j, { x: 1, y: 0 }); // A coule J : Antoine (2 cases, 2 touches) et Marc (2 cases, 0 touche)
    const finished = events.at(-1);
    if (finished?.type !== 'GAME_FINISHED') throw new Error('GAME_FINISHED attendu');
    expect(finished.ranking.map((r) => [r.playerId, r.rank])).toEqual([
      [a, 1],
      [m, 2],
      [j, 3],
    ]);
    // Égalité parfaite : Antoine et Marc sans aucune touche.
    const tie = startedGame(3, tinySettings({ endCondition: 'first_fleet_sunk' }), TINY_FLEET);
    const [ta, tj, tm] = tie.ids as [string, string, string];
    turn(tie.h, tj, { x: 5, y: 5 }); // A → J raté
    turn(tie.h, ta, { x: 5, y: 5 }); // J → A raté
    turn(tie.h, tj, { x: 0, y: 0 }); // M → J touché
    turn(tie.h, tj, { x: 1, y: 0 }); // A → J coulé : Antoine 1 touche, Marc 1 touche
    const f2 = tie.h.events.at(-1);
    if (f2?.type !== 'GAME_FINISHED') throw new Error('GAME_FINISHED attendu');
    expect(f2.ranking.map((r) => [r.playerId, r.rank])).toEqual([
      [ta, 1],
      [tm, 1],
      [tj, 3],
    ]);
    expect(f2.winnerId).toBeNull();
  });

  it('le placement aléatoire abandonne proprement quand la grille ne peut pas accueillir la flotte', () => {
    const impossible = makeSettings({
      variant: 'sequential',
      maxPlayers: 2,
      grid: { width: 6, height: 6 },
      fleet: [
        { type: 'a', size: 6 },
        { type: 'b', size: 6 },
        { type: 'c', size: 6 },
        { type: 'd', size: 6 },
      ],
      shipsMayTouch: false,
    });
    expect(() => randomFleet(impossible, mulberry32(1))).toThrow(/impossible/);
    expect(() => pick(mulberry32(1), [])).toThrow(/vide/);
  });

  it('un siège libéré au milieu est réattribué, et evolve ignore un tir engagé hors manche', () => {
    const h = new Harness(makeSettings({ variant: 'sequential', maxPlayers: 3 }, 'quick'));
    const a = h.join('Antoine', 'red');
    const j = h.join('Julie', 'yellow');
    const m = h.join('Marc', 'blue');
    h.expectOk(HOST, { type: 'KICK_PLAYER', playerId: j });
    const s = h.join('Sophie', 'purple');
    expect(h.state.players.map((p) => [p.playerId, p.seat])).toEqual([
      [a, 0],
      [s, 1],
      [m, 2],
    ]);
    const after = evolve(h.state, {
      type: 'SHOT_COMMITTED',
      round: 0,
      shooterId: s,
      targetId: m,
      coord: { x: 0, y: 0 },
    });
    expect(after.round).toBeNull();
    expect(
      initialState({ gameId: 'x', code: 'ABCD', settings: h.state.settings, createdAt: 0 }).seq,
    ).toBe(0);
  });
});
