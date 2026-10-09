import { describe, expect, it } from 'vitest';
import { projectPrivate } from '../src/battleship/project.js';
import { antiFocusBlocked, legalTargets } from '../src/battleship/rules/targets.js';
import { makeSettings } from '../src/battleship/settings.js';
import { player, startedGame, turn } from './helpers.js';

const settings = (antiFocusMaxStreak: number | null, maxPlayers = 3) =>
  makeSettings({ variant: 'sequential', maxPlayers, antiFocusMaxStreak }, 'quick');

describe('règle anti-acharnement', () => {
  it('éteinte par défaut : on vise qui on veut, autant qu’on veut', () => {
    const { h, ids } = startedGame(3, settings(null));
    const [a, j, m] = ids as [string, string, string];
    for (let i = 0; i < 3; i++) {
      turn(h, j, { x: 7, y: 7 - i }); // Antoine, toujours sur Julie
      turn(h, m, { x: 7, y: 7 - i }); // Julie
      turn(h, a, { x: 7, y: 7 - i }); // Marc
    }
    expect(legalTargets(h.state, a)).toEqual([j, m]);
    expect(antiFocusBlocked(h.state, a)).toBeNull();
  });

  it('à 1 : jamais deux fois de suite sur le même, et le refus l’explique', () => {
    const { h, ids } = startedGame(3, settings(1));
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 7, y: 7 }); // Antoine vise Julie
    turn(h, m, { x: 7, y: 7 }); // Julie vise Marc
    turn(h, a, { x: 7, y: 7 }); // Marc vise Antoine
    expect(antiFocusBlocked(h.state, a)).toBe(j);
    expect(legalTargets(h.state, a)).toEqual([m]);
    expect(projectPrivate(h.state, a).me).toMatchObject({ legalTargets: [m], antiFocusBlocked: j });
    const refused = h.run(player(a), { type: 'FIRE', targetId: j, coord: { x: 7, y: 6 } });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.rejection.code).toBe('TARGET_NOT_LEGAL');
      expect(refused.rejection.message).toContain('Pas plus de 1 tir de suite');
    }
    turn(h, m, { x: 7, y: 6 }); // Antoine vise Marc : Julie redevient visable au tour suivant
    turn(h, a, { x: 7, y: 6 });
    turn(h, j, { x: 7, y: 6 });
    expect(legalTargets(h.state, a)).toEqual([j]);
    expect(antiFocusBlocked(h.state, a)).toBe(m);
  });

  it('à 2 : deux tirs de suite passent, le troisième doit changer de cible', () => {
    const { h, ids } = startedGame(3, settings(2));
    const [a, j, m] = ids as [string, string, string];
    turn(h, j, { x: 7, y: 7 });
    turn(h, m, { x: 7, y: 7 });
    turn(h, a, { x: 7, y: 7 });
    expect(legalTargets(h.state, a)).toEqual([j, m]);
    turn(h, j, { x: 7, y: 6 });
    turn(h, m, { x: 7, y: 6 });
    turn(h, a, { x: 7, y: 6 });
    expect(legalTargets(h.state, a)).toEqual([m]);
    expect(projectPrivate(h.state, a).me.antiFocusBlocked).toBe(j);
  });

  it('ne s’applique plus quand il ne reste qu’une cible, ni à deux joueurs', () => {
    const two = startedGame(2, settings(1, 2));
    const [a, j] = two.ids as [string, string];
    turn(two.h, j, { x: 7, y: 7 });
    turn(two.h, a, { x: 7, y: 7 });
    expect(legalTargets(two.h.state, a)).toEqual([j]);
    expect(antiFocusBlocked(two.h.state, a)).toBeNull();

    // À trois, Antoine coule Marc en deux tirs : Julie reste seule, donc visable sans limite.
    const three = startedGame(3, settings(1));
    const [x, y, z] = three.ids as [string, string, string];
    turn(three.h, y, { x: 7, y: 7 }); // Antoine → Julie
    turn(three.h, z, { x: 7, y: 7 }); // Julie → Marc
    turn(three.h, x, { x: 7, y: 7 }); // Marc → Antoine
    expect(legalTargets(three.h.state, x)).toEqual([z]);
    void y;
  });
});
