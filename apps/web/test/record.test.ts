import { describe, expect, it } from 'vitest';
import { myRank, outcomeOf, recordLabel, tally, withResult } from '../src/shared/record.js';

describe('bilan du joueur', () => {
  it('déduit l’issue du rang final', () => {
    expect(outcomeOf(null)).toBeNull();
    expect(outcomeOf(undefined)).toBeNull();
    expect(outcomeOf(1)).toBe('win');
    expect(outcomeOf(3)).toBe('loss');
  });

  it('lit mon rang sur le joueur, sinon dans le classement', () => {
    const me = { playerId: 'moi' };
    expect(myRank({ players: [{ playerId: 'moi', rank: null }], ranking: null, me })).toBeNull();
    expect(myRank({ players: [{ playerId: 'moi', rank: 3 }], ranking: null, me })).toBe(3);
    expect(
      myRank({
        players: [{ playerId: 'moi', rank: null }],
        ranking: [{ playerId: 'moi', rank: 1 }],
        me,
      }),
    ).toBe(1);
    expect(myRank({ players: [], ranking: [], me })).toBeNull();
  });

  it('ne compte une partie qu’une fois', () => {
    const one = withResult({}, 'g1', 'win');
    expect(withResult(one, 'g1', 'win')).toBe(one); // rien de neuf : même objet
    const two = withResult(one, 'g2', 'loss');
    expect(tally(two)).toEqual({ wins: 1, losses: 1 });
    expect(tally({})).toEqual({ wins: 0, losses: 0 });
  });

  it('écrit le bilan au pluriel qui convient', () => {
    expect(recordLabel({ wins: 0, losses: 0 })).toBeNull();
    expect(recordLabel({ wins: 1, losses: 0 })).toBe('1 victoire · 0 défaite');
    expect(recordLabel({ wins: 3, losses: 2 })).toBe('3 victoires · 2 défaites');
  });
});
