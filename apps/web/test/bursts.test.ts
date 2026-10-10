import { describe, expect, it } from 'vitest';
import type { ResolvedShot } from '@navale/protocol';
import { burstResult, groupBursts } from '../src/shared/bursts.js';

const center = { x: 1, y: 1 };
const shot = (over: Partial<ResolvedShot>): ResolvedShot => ({
  round: 0,
  shooterId: 'a',
  targetId: 'b',
  coord: { x: 0, y: 0 },
  result: 'MISS',
  ...over,
});
const burst = (result: ResolvedShot['result'], x: number, round = 0): ResolvedShot =>
  shot({ round, coord: { x, y: 1 }, result, burst: { center, size: 3 } });

describe('rafales de missile', () => {
  it('donnent un seul verdict : coulé, sinon touché, sinon raté', () => {
    expect(burstResult([{ result: 'MISS' }, { result: 'MISS' }])).toBe('MISS');
    expect(burstResult([{ result: 'MISS' }, { result: 'HIT' }])).toBe('HIT');
    expect(burstResult([{ result: 'HIT' }, { result: 'SUNK' }])).toBe('SUNK');
  });

  it('se regroupent en une ligne au centre de la rafale, entre les tirs ordinaires', () => {
    const before = shot({ shooterId: 'b', targetId: 'a', round: 0 });
    const after = shot({ round: 1, coord: { x: 5, y: 5 }, result: 'HIT' });
    const entries = groupBursts([
      before,
      burst('MISS', 0),
      burst('HIT', 1),
      burst('MISS', 2),
      after,
      burst('MISS', 0, 2),
    ]);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toBe(before);
    expect(entries[1]).toMatchObject({ coord: center, result: 'HIT', burstSize: 3 });
    expect(entries[2]).toBe(after);
    expect(entries[3]).toMatchObject({ round: 2, result: 'MISS', burstSize: 1 });
  });
});
