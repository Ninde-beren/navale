import { describe, expect, it } from 'vitest';
import { duel } from '../bench/duel.js';

describe('banc de duels', () => {
  it('rejoue à l’identique avec la même graine, et compte chaque partie une fois', () => {
    const run = () =>
      duel({ a: { commanderId: 'capitaine' }, b: { commanderId: 'temoin' }, games: 6, seed: 7 });
    const result = run();
    expect(run()).toEqual(result);
    expect(result.a.wins + result.b.wins + result.draws).toBe(6);
    expect(result.b.abilityUses).toBe(0);
  });

  it('laisse choisir le moment où un camp joue sa capacité', () => {
    const never = duel({
      a: { commanderId: 'artificier', when: () => false },
      b: { commanderId: 'amiral', level: 'easy' },
      games: 4,
      variant: 'simultaneous',
      preset: 'quick',
    });
    expect(never.a.abilityUses).toBe(0);
    expect(never.rounds).toBeGreaterThan(0);
  });
});
