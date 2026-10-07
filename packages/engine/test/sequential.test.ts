import { describe, expect, it } from 'vitest';
import { makeSettings } from '../src/battleship/settings.js';
import { HOST, SYSTEM, player, startedGame, turn } from './helpers.js';

describe('tour par tour', () => {
  it('tir dans l’eau : RATÉ, la case est révélée, le tour passe au siège suivant', () => {
    const { h, ids } = startedGame(3);
    const [a, j] = ids as [string, string, string];
    const events = turn(h, j, { x: 7, y: 7 });
    expect(h.types(events)).toEqual(['SHOT_RESOLVED', 'ROUND_RESOLVED', 'ROUND_STARTED']);
    expect(events[0]).toMatchObject({
      shooterId: a,
      targetId: j,
      coord: { x: 7, y: 7 },
      result: 'MISS',
      round: 0,
    });
    expect(h.state.players[1]!.shotsReceived).toEqual([{ coord: { x: 7, y: 7 }, result: 'MISS' }]);
    expect(h.state.round).toMatchObject({ index: 1, expectedShooters: [j] });
    expect(h.state.shotsLog).toHaveLength(1);
  });

  it('touché : TOUCHÉ, le bateau encaisse l’impact, la case est publique', () => {
    const { h, ids } = startedGame(3);
    const [, j] = ids as [string, string, string];
    const [shot] = turn(h, j, { x: 0, y: 0 });
    expect(shot).toMatchObject({ result: 'HIT' });
    expect(h.state.players[1]!.fleet[0]!.hits).toEqual([{ x: 0, y: 0 }]);
    expect(h.state.players[1]!.shotsReceived).toEqual([{ coord: { x: 0, y: 0 }, result: 'HIT' }]);
  });

  it('coulé : dernière case du torpilleur, cases révélées en mode classique seulement', () => {
    const { h, ids } = startedGame(3);
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 6 }); // Antoine touche le torpilleur de Julie
    turn(h, m, { x: 7, y: 7 }); // Julie rate Marc
    turn(h, a, { x: 7, y: 7 }); // Marc rate Antoine
    const [shot] = turn(h, j, { x: 1, y: 6 });
    expect(shot).toMatchObject({
      result: 'SUNK',
      sunk: {
        shipId: 'ship-3',
        size: 2,
        cells: [
          { x: 0, y: 6 },
          { x: 1, y: 6 },
        ],
      },
    });

    const secret = startedGame(
      3,
      makeSettings({ variant: 'sequential', maxPlayers: 4, sunkReveal: 'secret' }, 'quick'),
    );
    turn(secret.h, secret.ids[1]!, { x: 0, y: 6 });
    turn(secret.h, secret.ids[2]!, { x: 7, y: 7 });
    turn(secret.h, secret.ids[0]!, { x: 7, y: 7 });
    const [s2] = turn(secret.h, secret.ids[1]!, { x: 1, y: 6 });
    expect(s2).toMatchObject({ result: 'SUNK', sunk: { shipId: 'ship-3', size: 2 } });
    expect((s2 as { sunk?: { cells?: unknown } }).sunk?.cells).toBeUndefined();
  });

  it('refuse les tirs illégaux, un code par cas', () => {
    const { h, ids } = startedGame(3);
    const [a, j, m] = ids as [string, string, string];
    h.expectReject(
      player(j),
      { type: 'FIRE', targetId: a, coord: { x: 1, y: 1 } },
      'NOT_YOUR_TURN',
    );
    h.expectReject(
      player(a),
      { type: 'FIRE', targetId: a, coord: { x: 1, y: 1 } },
      'TARGET_IS_SELF',
    );
    h.expectReject(
      player(a),
      { type: 'FIRE', targetId: 'nobody', coord: { x: 1, y: 1 } },
      'TARGET_NOT_ALIVE',
    );
    h.expectReject(
      player(a),
      { type: 'FIRE', targetId: j, coord: { x: 8, y: 1 } },
      'COORD_OUT_OF_BOUNDS',
    );
    h.expectReject(
      player(a),
      { type: 'FIRE', targetId: j, coord: { x: -1, y: 1 } },
      'COORD_OUT_OF_BOUNDS',
    );
    h.expectReject(
      player('ghost'),
      { type: 'FIRE', targetId: j, coord: { x: 1, y: 1 } },
      'PLAYER_UNKNOWN',
    );
    h.expectReject(HOST, { type: 'FIRE', targetId: j, coord: { x: 1, y: 1 } }, 'WRONG_STATE');
    turn(h, j, { x: 7, y: 7 });
    turn(h, m, { x: 7, y: 7 });
    h.expectReject(
      player(m),
      { type: 'FIRE', targetId: j, coord: { x: 7, y: 7 } },
      'CELL_ALREADY_SHOT',
    );
  });

  it('refuse de tirer hors partie', () => {
    const { h, ids } = startedGame(2);
    h.expectOk(HOST, { type: 'CANCEL_GAME' });
    h.expectReject(
      player(ids[0]!),
      { type: 'FIRE', targetId: ids[1]!, coord: { x: 1, y: 1 } },
      'GAME_NOT_PLAYING',
    );
  });

  it('l’hôte ou le système passe le tour d’un joueur absent', () => {
    const { h, ids } = startedGame(3);
    const [a, j] = ids as [string, string, string];
    h.expectReject(player(a), { type: 'FORCE_ROUND' }, 'NOT_HOST');
    const events = h.expectOk(HOST, { type: 'FORCE_ROUND' });
    expect(h.types(events)).toEqual(['ROUND_RESOLVED', 'ROUND_STARTED']);
    expect(events[0]).toMatchObject({ round: 0, skipped: [a] });
    expect(h.state.round).toMatchObject({ index: 1, expectedShooters: [j] });
    h.expectOk(SYSTEM, { type: 'FORCE_ROUND' });
    expect(h.active).toBe(ids[2]);
  });

  it('fait tourner les sièges et revient au premier', () => {
    const { h, ids } = startedGame(3);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(h.active);
      const target = ids.find((id) => id !== h.active)!;
      turn(h, target, { x: 7, y: 7 - i });
    }
    expect(seen).toEqual([ids[0], ids[1], ids[2], ids[0]]);
  });

  it('arme un chrono de manche quand il est paramétré', () => {
    const { h } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2, roundTimerSeconds: 30 }, 'quick'),
    );
    expect(h.state.round?.deadline).toBe(1_000 + 30_000);
  });
});
