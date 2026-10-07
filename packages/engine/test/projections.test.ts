import { describe, expect, it } from 'vitest';
import { projectPrivate, projectPublic } from '../src/battleship/project.js';
import { assertNoLeak } from './leak.js';
import { startedGame, turn } from './helpers.js';

describe('projections', () => {
  it('la vue publique ne contient aucune case de bateau non révélée', () => {
    const { h, ids } = startedGame(3);
    assertNoLeak(h.state);
    turn(h, ids[1]!, { x: 0, y: 0 });
    turn(h, ids[2]!, { x: 7, y: 7 });
    turn(h, ids[0]!, { x: 0, y: 6 });
    assertNoLeak(h.state);
    const pub = projectPublic(h.state, { [ids[0]!]: true });
    expect(pub.kind).toBe('board');
    expect(pub.players[1]).toMatchObject({
      shipsRemaining: 4,
      revealed: [{ coord: { x: 0, y: 0 }, result: 'HIT' }],
      sunkShips: [],
      connected: false,
    });
    expect(pub.players[0]!.connected).toBe(true);
    expect(pub.round).toMatchObject({ index: 3, activePlayerId: ids[0], committed: [] });
    expect(pub.lastShots).toHaveLength(1);
    expect(pub.lastShots[0]).toMatchObject({ round: 2, shooterId: ids[2] });
  });

  it('décrit les bateaux coulés avec leurs cases en mode classique', () => {
    const { h, ids } = startedGame(2);
    const [a, j] = ids as [string, string];
    turn(h, j, { x: 0, y: 6 });
    turn(h, a, { x: 7, y: 7 });
    turn(h, j, { x: 1, y: 6 });
    const pub = projectPublic(h.state);
    expect(pub.players[1]!.sunkShips).toEqual([
      {
        shipId: 'ship-3',
        size: 2,
        cells: [
          { x: 0, y: 6 },
          { x: 1, y: 6 },
        ],
      },
    ]);
    expect(pub.players[1]!.shipsRemaining).toBe(3);
    assertNoLeak(h.state);
  });

  it('la vue privée porte ma flotte, mes cibles légales, mes tirs et si je peux tirer', () => {
    const { h, ids } = startedGame(3);
    const [a, j, m] = ids as [string, string, string];
    const mine = projectPrivate(h.state, a);
    expect(mine.kind).toBe('player');
    expect(mine.me).toMatchObject({
      playerId: a,
      cellsRemaining: 12,
      legalTargets: [j, m],
      canFire: true,
      pendingShot: null,
    });
    expect(mine.me.fleet).toHaveLength(4);
    expect(projectPrivate(h.state, j).me.canFire).toBe(false);
    turn(h, j, { x: 0, y: 0 });
    const after = projectPrivate(h.state, a);
    expect(after.me.shotsFired).toHaveLength(1);
    expect(after.me.canFire).toBe(false);
    expect(projectPrivate(h.state, j).me.cellsRemaining).toBe(11);
    expect(() => projectPrivate(h.state, 'ghost')).toThrow();
  });
});
