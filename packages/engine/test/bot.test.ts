import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chooseShot, densestCells, woundedCells } from '../src/battleship/bot/strategy.js';
import { projectPrivate } from '../src/battleship/project.js';
import { makeSettings } from '../src/battleship/settings.js';
import { coordKey } from '../src/battleship/state.js';
import { mulberry32 } from '../src/core/random.js';
import { legalTargets } from '../src/battleship/rules/targets.js';
import { HOST, startedGame, turn } from './helpers.js';
import { randomGame } from './random-game.js';

describe('bot : chasse et ciblage', () => {
  it('en chasse, tire une case non révélée, sur la parité qui garde le plus de cases libres', () => {
    const { h, ids } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'),
    );
    const [a, j] = ids as [string, string];
    const rnd = mulberry32(3);
    for (let i = 0; i < 30; i++) {
      const shot = chooseShot(projectPrivate(h.state, a), rnd)!;
      expect(shot.targetId).toBe(j);
      expect(shot.coord.x).toBeLessThan(8);
      expect(shot.coord.y).toBeLessThan(8);
    }
    // On révèle des cases de parité paire chez Julie (sans toucher) : le bot passe sur la parité impaire.
    const misses = [
      { x: 7, y: 7 },
      { x: 5, y: 7 },
      { x: 3, y: 7 },
      { x: 7, y: 5 },
    ];
    for (const c of misses) {
      turn(h, j, c); // Antoine rate
      turn(h, a, { x: 7, y: 7 - misses.indexOf(c) }); // Julie rate
    }
    const view = projectPrivate(h.state, a);
    for (let i = 0; i < 30; i++) {
      const shot = chooseShot(view, rnd)!;
      expect((shot.coord.x + shot.coord.y) % 2).toBe(1);
      expect(
        view.players[1]!.revealed.some((r) => coordKey(r.coord) === coordKey(shot.coord)),
      ).toBe(false);
    }
  });

  it('en ciblage, tire autour d’une touche non conclue, puis dans l’alignement', () => {
    const { h, ids } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'),
    );
    const [a, j] = ids as [string, string];
    turn(h, j, { x: 1, y: 0 }); // Antoine touche le croiseur de Julie en B1
    turn(h, a, { x: 7, y: 7 }); // Julie rate
    let view = projectPrivate(h.state, a);
    expect(woundedCells(view.players[1]!)).toEqual([{ x: 1, y: 0 }]);
    const rnd = mulberry32(5);
    for (let i = 0; i < 20; i++) {
      const shot = chooseShot(view, rnd)!;
      expect(['0,0', '2,0', '1,1']).toContain(coordKey(shot.coord)); // voisines dans la grille, hors (1,-1)
    }
    turn(h, j, { x: 2, y: 0 }); // deuxième touche alignée : C1
    turn(h, a, { x: 6, y: 7 });
    view = projectPrivate(h.state, a);
    for (let i = 0; i < 20; i++) {
      const shot = chooseShot(view, rnd)!;
      expect(['0,0', '3,0']).toContain(coordKey(shot.coord)); // les deux bouts de la ligne
    }
  });

  it('cesse de cibler un bateau coulé et préfère la cible blessée', () => {
    const { h, ids } = startedGame(
      3,
      makeSettings({ variant: 'sequential', maxPlayers: 3 }, 'quick'),
    );
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 0, y: 6 }); // A touche le torpilleur de J
    turn(h, m, { x: 7, y: 7 });
    turn(h, a, { x: 7, y: 7 });
    turn(h, j, { x: 1, y: 6 }); // A coule le torpilleur de J
    turn(h, m, { x: 0, y: 0 }); // J touche M
    turn(h, a, { x: 6, y: 7 });
    const view = projectPrivate(h.state, a);
    expect(woundedCells(view.players[1]!)).toEqual([]);
    expect(woundedCells(view.players[2]!)).toEqual([{ x: 0, y: 0 }]);
    const shot = chooseShot(view, mulberry32(1))!;
    expect(shot.targetId).toBe(m);
    expect(['1,0', '0,1']).toContain(coordKey(shot.coord));
  });

  it('facile : une case non révélée au hasard, sans s’acharner sur une touche', () => {
    const { h, ids } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'),
    );
    const [a, j] = ids as [string, string];
    turn(h, j, { x: 1, y: 0 }); // Antoine touche le croiseur de Julie en B1
    turn(h, a, { x: 7, y: 7 });
    const view = projectPrivate(h.state, a);
    const rnd = mulberry32(9);
    const shots = Array.from({ length: 30 }, () => chooseShot(view, rnd, 'easy')!);
    for (const shot of shots) {
      expect(shot.targetId).toBe(j);
      expect(coordKey(shot.coord)).not.toBe('1,0');
    }
    const neighbours = ['0,0', '2,0', '1,1'];
    expect(shots.some((s) => !neighbours.includes(coordKey(s.coord)))).toBe(true);
  });

  it('difficile : en chasse, vise le centre de la grille, là où le plus de placements passent', () => {
    const { h, ids } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'),
    );
    const [a, j] = ids as [string, string];
    const view = projectPrivate(h.state, a);
    const rnd = mulberry32(2);
    for (let i = 0; i < 20; i++) {
      const shot = chooseShot(view, rnd, 'hard')!;
      expect(shot.targetId).toBe(j);
      expect([3, 4]).toContain(shot.coord.x);
      expect([3, 4]).toContain(shot.coord.y);
    }
    expect(densestCells(view, view.players[1]!)).toHaveLength(4);
  });

  it('difficile : après une touche, la case que le plus de placements traversent, puis le bout de la ligne', () => {
    const { h, ids } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'),
    );
    const [a, j] = ids as [string, string];
    turn(h, j, { x: 1, y: 0 }); // touche en B1 : C1 est traversée par plus de placements que A1 ou B2
    turn(h, a, { x: 7, y: 7 });
    let view = projectPrivate(h.state, a);
    const rnd = mulberry32(4);
    for (let i = 0; i < 10; i++) expect(coordKey(chooseShot(view, rnd, 'hard')!.coord)).toBe('2,0');
    turn(h, j, { x: 2, y: 0 }); // deuxième touche alignée : D1 l'emporte sur A1, le bord
    turn(h, a, { x: 6, y: 7 });
    view = projectPrivate(h.state, a);
    for (let i = 0; i < 10; i++) expect(coordKey(chooseShot(view, rnd, 'hard')!.coord)).toBe('3,0');
  });

  it('renvoie null sans cible légale', () => {
    const { h, ids } = startedGame(
      2,
      makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'),
    );
    h.expectOk(HOST, { type: 'CANCEL_GAME' });
    expect(chooseShot(projectPrivate(h.state, ids[0]!), mulberry32(1))).toBeNull();
  });

  it('ne tire jamais une case révélée ni une cible illégale, à aucun niveau, sur des parties au hasard', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 2, max: 4 }),
        (seed, players) => {
          const h = randomGame(seed, players, 'sequential', 40);
          if (h.state.status !== 'PLAYING') return;
          const rnd = mulberry32(seed);
          for (const p of h.state.players) {
            if (p.status !== 'ALIVE') continue;
            const view = projectPrivate(h.state, p.playerId);
            for (const level of ['easy', 'normal', 'hard'] as const) {
              const shot = chooseShot(view, rnd, level);
              expect(shot).not.toBeNull();
              expect(legalTargets(h.state, p.playerId)).toContain(shot!.targetId);
              const target = h.state.players.find((t) => t.playerId === shot!.targetId)!;
              expect(
                target.shotsReceived.some((s) => coordKey(s.coord) === coordKey(shot!.coord)),
              ).toBe(false);
            }
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
