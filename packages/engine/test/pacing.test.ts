import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@navale/protocol';
import { burstStaggerMs } from '../src/battleship/rules/abilities.js';
import { ghostLeadMs } from '../src/battleship/rules/ghosts.js';
import { pacing } from '../src/battleship/rules/pacing.js';

const D = 2500;
const shot = (over: Partial<Extract<GameEvent, { type: 'SHOT_RESOLVED' }>> = {}): GameEvent => ({
  type: 'SHOT_RESOLVED',
  round: 3,
  shooterId: 'a',
  targetId: 'b',
  coord: { x: 1, y: 1 },
  result: 'MISS',
  ...over,
});
const roundEnd: GameEvent = { type: 'ROUND_RESOLVED', round: 3, skipped: [] };

describe('cadence de l’écran central', () => {
  it('un tir a son temps d’annonce, la fin de manche vient après', () => {
    expect(pacing([shot(), roundEnd], D)).toEqual({ offsets: [0, D], total: D });
  });

  it('une rafale part d’un coup, annoncée une fois après ses départs décalés', () => {
    const burst = { center: { x: 2, y: 2 }, size: 3 };
    const events = [shot({ burst }), shot({ burst }), shot({ burst }), roundEnd];
    expect(pacing(events, D)).toEqual({
      offsets: [0, 0, 0, D + 2 * burstStaggerMs(D)],
      total: D + 2 * burstStaggerMs(D),
    });
  });

  it('le barrage d’un fantôme aussi, avec son souffle ; puis des cases éclairées', () => {
    const barrage = { size: 2 };
    const lit: GameEvent = { type: 'CELLS_LIT', round: 3, playerId: 'j', card: 'wisp', cells: [] };
    const volley = D + ghostLeadMs(D) + burstStaggerMs(D);
    expect(pacing([shot({ barrage }), shot({ barrage, targetId: 'c' }), lit], D)).toEqual({
      offsets: [0, 0, volley],
      total: volley + D + ghostLeadMs(D),
    });
  });

  it('une capacité sans tir a son annonce ; celle d’un missile passe par sa rafale', () => {
    const used = (ability: 'radar' | 'missile'): GameEvent => ({
      type: 'ABILITY_USED',
      round: 3,
      playerId: 'a',
      ability,
      targetId: 'b',
      coord: { x: 1, y: 1 },
    });
    expect(pacing([used('radar'), roundEnd], D).total).toBe(D);
    expect(pacing([used('missile'), roundEnd], D).total).toBe(0);
  });
});
