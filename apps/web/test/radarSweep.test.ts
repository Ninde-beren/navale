import { describe, expect, it } from 'vitest';
import { RADAR_SWEEP } from '../src/shared/audio.js';
import { RADAR_SWEEP_MS, beamDelay, sweepZone } from '../src/shared/radarSweep.js';

const grid = { width: 10, height: 10 };
const turn = RADAR_SWEEP.turnSeconds;

describe('balayage du radar', () => {
  it('couvre la zone de la règle, rognée par la grille', () => {
    expect(sweepZone(grid, { x: 4, y: 4 }, 3).box).toEqual({ x: 3, y: 3, width: 3, height: 3 });
    // Dans un coin, A1 : il ne reste que 2 × 2 cases, comme pour la règle.
    const corner = sweepZone(grid, { x: 0, y: 0 }, 3);
    expect(corner.box).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(corner.cells).toHaveLength(4);
    expect(sweepZone(grid, { x: 9, y: 5 }, 3).box).toEqual({ x: 8, y: 4, width: 2, height: 3 });
  });

  it('allume les cases dans l’ordre du rayon : le centre, puis du nord dans le sens des aiguilles d’une montre', () => {
    const c = { x: 4, y: 4 };
    expect(beamDelay(c, c)).toBe(0);
    expect(beamDelay(c, { x: 4, y: 3 })).toBe(0); // nord
    expect(beamDelay(c, { x: 5, y: 3 })).toBeCloseTo(turn / 8); // nord-est
    expect(beamDelay(c, { x: 5, y: 4 })).toBeCloseTo(turn / 4); // est
    expect(beamDelay(c, { x: 4, y: 5 })).toBeCloseTo(turn / 2); // sud
    expect(beamDelay(c, { x: 3, y: 4 })).toBeCloseTo((3 * turn) / 4); // ouest
    expect(beamDelay(c, { x: 3, y: 3 })).toBeCloseTo((7 * turn) / 8); // nord-ouest
    for (const cell of sweepZone(grid, c, 5).cells) {
      expect(beamDelay(c, cell)).toBeGreaterThanOrEqual(0);
      expect(beamDelay(c, cell)).toBeLessThan(turn);
    }
  });

  it('dure ses tours, puis un court fondu : autant que son son', () => {
    const turns = RADAR_SWEEP.turns * RADAR_SWEEP.turnSeconds * 1000;
    expect(RADAR_SWEEP_MS).toBeGreaterThan(turns);
    expect(RADAR_SWEEP_MS - turns).toBeLessThanOrEqual(300);
  });
});
