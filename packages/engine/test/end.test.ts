import { describe, expect, it } from 'vitest';
import { battleship } from '../src/battleship/index.js';
import { legalTargets } from '../src/battleship/rules/targets.js';
import { HOST, TINY_FLEET, player, startedGame, tinySettings, turn } from './helpers.js';

describe('élimination et fin de partie', () => {
  it('élimine le joueur sans case restante, avec son rang, et l’écarte du jeu', () => {
    const { h, ids } = startedGame(3, tinySettings(), TINY_FLEET);
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 0 }); // Antoine touche Julie
    turn(h, m, { x: 5, y: 5 }); // Julie rate Marc
    turn(h, a, { x: 5, y: 5 }); // Marc rate Antoine
    const events = turn(h, j, { x: 1, y: 0 }); // Antoine coule Julie
    expect(h.types(events)).toEqual([
      'SHOT_RESOLVED',
      'PLAYER_ELIMINATED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    expect(events[1]).toMatchObject({ playerId: j, round: 3, rank: 3 });
    expect(h.state.players[1]).toMatchObject({
      status: 'ELIMINATED',
      rank: 3,
      eliminatedAtRound: 3,
    });
    expect(h.state.round?.expectedShooters).toEqual([m]); // Julie est sautée
    expect(legalTargets(h.state, m)).toEqual([a]);
    h.expectReject(
      player(m),
      { type: 'FIRE', targetId: j, coord: { x: 3, y: 3 } },
      'TARGET_NOT_ALIVE',
    );
    h.expectReject(player(j), { type: 'FIRE', targetId: a, coord: { x: 3, y: 3 } }, 'NOT_ALIVE');
    expect(battleship.isFinished(h.state)).toBe(false);
  });

  it('termine en dernier survivant avec classement et statistiques', () => {
    const { h, ids } = startedGame(3, tinySettings(), TINY_FLEET);
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 0 }); // A → J touché
    turn(h, m, { x: 5, y: 5 }); // J → M raté
    turn(h, a, { x: 5, y: 5 }); // M → A raté
    turn(h, j, { x: 1, y: 0 }); // A → J coulé, Julie éliminée (rang 3)
    turn(h, a, { x: 4, y: 4 }); // M → A raté
    turn(h, m, { x: 0, y: 0 }); // A → M touché
    turn(h, a, { x: 3, y: 3 }); // M → A raté
    const events = turn(h, m, { x: 1, y: 0 }); // A → M coulé : fin
    expect(h.types(events)).toEqual([
      'SHOT_RESOLVED',
      'PLAYER_ELIMINATED',
      'ROUND_RESOLVED',
      'GAME_FINISHED',
    ]);
    expect(h.state.status).toBe('FINISHED');
    expect(battleship.isFinished(h.state)).toBe(true);
    const finished = events[3];
    expect(finished?.type).toBe('GAME_FINISHED');
    if (finished?.type !== 'GAME_FINISHED') return;
    expect(finished.winnerId).toBe(a);
    expect(finished.ranking.map((r) => [r.playerId, r.rank])).toEqual([
      [a, 1],
      [m, 2],
      [j, 3],
    ]);
    expect(finished.ranking[0]).toMatchObject({
      shotsFired: 4,
      hits: 4,
      accuracy: 1,
      shipsSunk: 2,
      playersEliminated: 2,
      cellsRemaining: 2,
    });
    expect(finished.ranking[1]).toMatchObject({
      shotsFired: 3,
      hits: 0,
      accuracy: 0,
      cellsRemaining: 0,
    });
    expect(battleship.nextDeadline(h.state)).toBeNull();
    h.expectReject(
      player(a),
      { type: 'FIRE', targetId: m, coord: { x: 2, y: 2 } },
      'GAME_NOT_PLAYING',
    );
    h.expectReject(HOST, { type: 'CANCEL_GAME' }, 'WRONG_STATE');
  });

  it('termine à la première flotte coulée, classement aux cases restantes', () => {
    const { h, ids } = startedGame(
      3,
      tinySettings({ endCondition: 'first_fleet_sunk' }),
      TINY_FLEET,
    );
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 0 }); // A → J touché
    turn(h, a, { x: 0, y: 0 }); // J → A touché
    turn(h, a, { x: 5, y: 5 }); // M → A raté
    const events = turn(h, j, { x: 1, y: 0 }); // A → J coulé : fin immédiate
    expect(h.types(events)).toEqual([
      'SHOT_RESOLVED',
      'PLAYER_ELIMINATED',
      'ROUND_RESOLVED',
      'GAME_FINISHED',
    ]);
    const finished = events[3];
    if (finished?.type !== 'GAME_FINISHED') throw new Error('GAME_FINISHED attendu');
    // Marc a 2 cases, Antoine 1, Julie 0.
    expect(finished.ranking.map((r) => [r.playerId, r.rank, r.cellsRemaining])).toEqual([
      [m, 1, 2],
      [a, 2, 1],
      [j, 3, 0],
    ]);
    expect(finished.winnerId).toBe(m);
  });

  it('à deux joueurs, le vainqueur est le dernier debout', () => {
    const { h, ids } = startedGame(2, tinySettings({ maxPlayers: 2 }), TINY_FLEET);
    const [a, j] = ids as [string, string];
    turn(h, j, { x: 0, y: 0 });
    turn(h, a, { x: 5, y: 5 });
    const events = turn(h, j, { x: 1, y: 0 });
    const finished = events.at(-1);
    expect(finished).toMatchObject({ type: 'GAME_FINISHED', winnerId: a });
  });
});
