import { describe, expect, it } from 'vitest';
import type { GameSettings } from '@navale/protocol';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { makeSettings, normalizeSettings } from '../src/battleship/settings.js';

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
});
