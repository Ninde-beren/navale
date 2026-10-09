import { describe, expect, it } from 'vitest';
import type { ResolvedShot } from '@navale/protocol';
import { mergeShots } from '../src/shared/shotHistory.js';

const shot = (round: number, shooterId: string, x: number): ResolvedShot => ({
  round,
  shooterId,
  targetId: 'cible',
  coord: { x, y: 0 },
  result: 'MISS',
});

describe('mergeShots', () => {
  it('ajoute les tirs nouveaux, ignore ceux déjà vus, garde les derniers', () => {
    const r0 = [shot(0, 'a', 0)];
    let kept = mergeShots([], r0, 5);
    expect(kept).toEqual(r0);
    expect(mergeShots(kept, r0, 5)).toBe(kept); // rien de neuf : même tableau
    kept = mergeShots(kept, [shot(1, 'b', 1)], 5);
    kept = mergeShots(kept, [shot(2, 'a', 2), shot(2, 'b', 3)], 5); // une salve
    kept = mergeShots(kept, [shot(3, 'a', 4)], 5);
    kept = mergeShots(kept, [shot(4, 'b', 5)], 5);
    expect(kept.map((s) => s.coord.x)).toEqual([1, 2, 3, 4, 5]);
  });
});
