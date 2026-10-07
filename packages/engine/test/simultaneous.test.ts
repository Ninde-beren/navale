import { describe, expect, it } from 'vitest';
import { HOST, TINY_FLEET, player, startedGame, tinySettings } from './helpers.js';

const salvo = (over = {}) => tinySettings({ variant: 'simultaneous', ...over });

describe('salve', () => {
  it('attend un tir de chaque vivant, engage sans révéler, puis résout dans l’ordre des sièges', () => {
    const { h, ids } = startedGame(3, salvo(), TINY_FLEET);
    const [a, j, m] = ids as [string, string, string];
    expect(h.state.round?.expectedShooters).toEqual([a, j, m]);

    const e1 = h.fire(j, m, { x: 5, y: 5 }); // Julie engage en premier
    expect(h.types(e1)).toEqual(['SHOT_COMMITTED']);
    expect(h.state.round?.committed[j]).toEqual({ targetId: m, coord: { x: 5, y: 5 } });
    h.expectReject(
      player(j),
      { type: 'FIRE', targetId: a, coord: { x: 2, y: 2 } },
      'ALREADY_COMMITTED',
    );

    h.fire(m, j, { x: 0, y: 0 });
    const e3 = h.fire(a, j, { x: 0, y: 0 }); // même case que Marc, dans la même manche
    expect(h.types(e3)).toEqual([
      'SHOT_COMMITTED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
      'SHOT_RESOLVED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    // Manche 0 : résolution à partir du siège 0 → Antoine, Julie, Marc.
    expect(
      e3.slice(1, 4).map((e) => (e as { shooterId: string; result: string }).shooterId),
    ).toEqual([a, j, m]);
    expect(e3[1]).toMatchObject({ shooterId: a, result: 'HIT' });
    expect(e3[2]).toMatchObject({ shooterId: j, result: 'MISS' });
    expect(e3[3]).toMatchObject({ shooterId: m, result: 'HIT' }); // doublon : même résultat, compté
    expect(h.state.players[1]!.shotsReceived).toHaveLength(1);
    expect(h.state.round).toMatchObject({ index: 1, expectedShooters: [a, j, m] });
  });

  it('crédite le COULÉ au premier tireur, élimine après la dernière résolution, classe les éliminés d’une même manche', () => {
    const { h, ids } = startedGame(3, salvo(), TINY_FLEET);
    const [a, j, m] = ids as [string, string, string];
    // Manche 0 : Julie prend une touche, Antoine aussi.
    h.fire(a, j, { x: 0, y: 0 });
    h.fire(j, a, { x: 0, y: 0 });
    h.fire(m, a, { x: 5, y: 5 });
    // Manche 1 (ordre à partir du siège 1 : Julie, Marc, Antoine) :
    // Julie achève Antoine, Marc double sur la même case, Antoine achève Julie.
    h.fire(a, j, { x: 1, y: 0 });
    h.fire(j, a, { x: 1, y: 0 });
    const events = h.fire(m, a, { x: 1, y: 0 });
    const resolved = events.filter((e) => e.type === 'SHOT_RESOLVED');
    expect(resolved.map((e) => (e as { shooterId: string }).shooterId)).toEqual([j, m, a]);
    expect(resolved[0]).toMatchObject({ shooterId: j, result: 'SUNK' });
    expect(resolved[1]).toMatchObject({ shooterId: m, result: 'HIT' });
    expect(resolved[2]).toMatchObject({ shooterId: a, result: 'SUNK' });
    const eliminated = events.filter((e) => e.type === 'PLAYER_ELIMINATED');
    // Antoine et Julie tombent dans la même manche, à égalité de cases restantes avant la manche : même rang.
    expect(eliminated).toEqual([
      expect.objectContaining({ playerId: a, rank: 2 }),
      expect.objectContaining({ playerId: j, rank: 2 }),
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'GAME_FINISHED', winnerId: m });
  });

  it('résout la salve avec les tirs manquants passés quand l’hôte force', () => {
    const { h, ids } = startedGame(3, salvo(), TINY_FLEET);
    const [a, j, m] = ids as [string, string, string];
    h.fire(a, j, { x: 3, y: 3 });
    const events = h.expectOk(HOST, { type: 'FORCE_ROUND' });
    expect(h.types(events)).toEqual(['SHOT_RESOLVED', 'ROUND_RESOLVED', 'ROUND_STARTED']);
    expect(events[1]).toMatchObject({ skipped: [j, m] });
  });

  it('en salve, aucun joueur n’est actif et chacun peut tirer une fois', () => {
    const { h, ids } = startedGame(2, salvo({ maxPlayers: 2 }), TINY_FLEET);
    const [a, j] = ids as [string, string];
    h.fire(j, a, { x: 4, y: 4 });
    h.expectReject(
      player(j),
      { type: 'FIRE', targetId: a, coord: { x: 2, y: 2 } },
      'ALREADY_COMMITTED',
    );
    const events = h.fire(a, j, { x: 4, y: 4 });
    expect(events.filter((e) => e.type === 'SHOT_RESOLVED')).toHaveLength(2);
  });
});
