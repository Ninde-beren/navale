import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/random.js';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { randomFleet, validateFleet } from '../src/battleship/placement.js';
import { makeSettings } from '../src/battleship/settings.js';
import type { GameState } from '../src/battleship/state.js';
import { assertNoLeak } from './leak.js';
import { randomGame } from './random-game.js';

describe('propriétés', () => {
  it('rejouer le journal redonne exactement l’état courant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 2, max: 4 }),
        fc.constantFrom('sequential', 'simultaneous'),
        (seed, players, variant) => {
          const h = randomGame(seed, players, variant as 'sequential' | 'simultaneous');
          expect(h.state.status).toBe('FINISHED');
          let replayed: GameState = initialState({
            gameId: 'g1',
            code: 'ABCD',
            settings: h.state.settings,
            createdAt: 0,
          });
          for (const e of h.events) replayed = evolve(replayed, e);
          expect(replayed).toEqual(h.state);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('la vue publique ne fuit jamais une case de bateau, à aucun moment d’aucune partie', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 2, max: 4 }),
        (seed, players) => {
          const settings = makeSettings({ variant: 'sequential', maxPlayers: players }, 'quick');
          let state = initialState({ gameId: 'g1', code: 'ABCD', settings, createdAt: 0 });
          const h = randomGame(seed, players, 'sequential');
          for (const e of h.events) {
            state = evolve(state, e);
            assertNoLeak(state);
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  it('le placement aléatoire est toujours valide', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.boolean(), (seed, touch) => {
        const s = makeSettings(
          { variant: 'sequential', maxPlayers: 2, shipsMayTouch: touch },
          'classic',
        );
        expect(validateFleet(s, randomFleet(s, mulberry32(seed))).ok).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('une partie finie a un classement complet, cohérent avec les rangs', () => {
    for (const seed of [3, 11, 42]) {
      for (const variant of ['sequential', 'simultaneous'] as const) {
        const h = randomGame(seed, 4, variant);
        const ranking = h.state.ranking!;
        expect(ranking).toHaveLength(4);
        expect(ranking.map((r) => r.playerId).sort()).toEqual(
          h.state.players.map((p) => p.playerId).sort(),
        );
        expect(ranking.filter((r) => r.rank === 1).length).toBeGreaterThanOrEqual(1);
        for (const r of ranking) expect(r.accuracy).toBeLessThanOrEqual(1);
      }
    }
  });
});
