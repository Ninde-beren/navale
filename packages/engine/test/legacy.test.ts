import { describe, expect, it } from 'vitest';
import type { GameEvent, GameSettings } from '@navale/protocol';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { makeSettings, normalizeSettings } from '../src/battleship/settings.js';
import { startedGame } from './helpers.js';

/** Des réglages tels qu'un journal d'avant les absents et les commandants les porte. */
function legacySettings(): GameSettings {
  const {
    afkBotSeconds: _a,
    afkBotLevel: _l,
    commanders: _c,
    ...rest
  } = makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick');
  return rest as GameSettings;
}

describe('anciens journaux', () => {
  it('se rejouent avec les réglages complétés : sans commandants, en attendant les absents', () => {
    const settings = legacySettings();
    expect(settings).not.toHaveProperty('commanders');
    const normalized = normalizeSettings(settings);
    expect(normalized.commanders).toEqual([]);
    expect(normalized.afkBotSeconds).toBeNull();
    expect(normalized.afkBotLevel).toBe('normal');

    let state = initialState({ gameId: 'g1', code: 'ABCD', settings, createdAt: 0 });
    expect(state.settings.commanders).toEqual([]);
    state = evolve(state, { type: 'GAME_STARTED', settings, seats: [], startedAt: 1 });
    expect(state.settings.commanders).toEqual([]);
    expect(state.settings.afkBotSeconds).toBeNull();
    // Des réglages complets ne sont pas touchés.
    const full = makeSettings({ variant: 'simultaneous', maxPlayers: 3, afkBotSeconds: 90 });
    expect(normalizeSettings(full)).toEqual(full);
  });

  it('un bouclier d’avant la règle permanente se rejoue : il ne tombe plus, ses tirs bloqués percent leur case', () => {
    const { h, ids } = startedGame(2);
    const [a, j] = ids as [string, string];
    // Tels que les journaux d'avant les portaient : un bouclier qui s'use (`turns`).
    const raised = {
      type: 'SHIELD_RAISED',
      round: 0,
      playerId: a,
      center: { x: 1, y: 1 },
      size: 3,
      turns: 1,
    } as unknown as GameEvent;
    let state = evolve(h.state, raised);
    state = evolve(state, {
      type: 'SHOT_RESOLVED',
      round: 0,
      shooterId: j,
      targetId: a,
      coord: { x: 0, y: 0 },
      result: 'BLOCKED',
    });
    state = evolve(state, {
      type: 'ROUND_STARTED',
      round: 1,
      expectedShooters: [a],
      startedAt: 2,
      deadline: null,
    });
    expect(state.players.find((p) => p.playerId === a)!.shield).toEqual({
      center: { x: 1, y: 1 },
      size: 3,
      pierced: [{ x: 0, y: 0 }],
    });
  });
});
