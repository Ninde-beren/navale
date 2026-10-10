import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRuntime } from '../src/runtime/game-runtime.js';
import { AfkSubstitution } from '../src/runtime/afk.js';

/** Un runtime factice : l'état et `handle` suffisent au veilleur. */
function fakeRuntime(over: Record<string, unknown> = {}) {
  const handle = vi.fn(async () => ({ ok: true as const, events: [] }));
  const state = {
    status: 'PLAYING',
    settings: { afkBotSeconds: 45 },
    round: { index: 0, expectedShooters: ['h1', 'b1'], committed: {} as Record<string, unknown> },
    players: [
      { playerId: 'h1', kind: 'human', status: 'ALIVE', substitute: null },
      { playerId: 'b1', kind: 'bot', status: 'ALIVE', substitute: null },
    ],
    ...over,
  };
  const runtime = { gameId: 'g1', state, handle } as unknown as GameRuntime;
  return { runtime, handle, state };
}

function tracker(connected: Record<string, boolean>) {
  return { of: () => connected };
}

describe('joueur absent relayé par un bot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('relaie un humain attendu et déconnecté depuis afkBotSeconds, par le système', async () => {
    const afk = new AfkSubstitution(tracker({ h1: false }));
    const { runtime, handle } = fakeRuntime();
    afk.onEvents(runtime, []);
    await vi.advanceTimersByTimeAsync(44_000);
    expect(handle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(handle).toHaveBeenCalledWith(
      { kind: 'system' },
      { type: 'SUBSTITUTE_PLAYER', playerId: 'h1' },
    );
    expect(handle).toHaveBeenCalledTimes(1);
    afk.close();
  });

  it('oublie le compte à rebours si le joueur revient, tire ou n’est plus attendu', async () => {
    const connected = { h1: false };
    const afk = new AfkSubstitution(tracker(connected));
    const { runtime, handle, state } = fakeRuntime();
    afk.onEvents(runtime, []);
    await vi.advanceTimersByTimeAsync(30_000);
    connected.h1 = true;
    afk.onPresence(runtime, 'h1', true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(handle).not.toHaveBeenCalled(); // revenu avant le délai, et pas relayé : rien à reprendre

    connected.h1 = false;
    afk.onPresence(runtime, 'h1', false);
    await vi.advanceTimersByTimeAsync(30_000);
    state.round.committed['h1'] = { targetId: 'b1', coord: { x: 0, y: 0 } };
    afk.onEvents(runtime, []);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(handle).not.toHaveBeenCalled(); // il a tiré avant le délai

    delete state.round.committed['h1'];
    state.round = { index: 1, expectedShooters: ['b1'], committed: {} };
    afk.onEvents(runtime, []);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(handle).not.toHaveBeenCalled(); // pas attendu dans cette manche
    afk.close();
  });

  it('rend la main dès le retour d’un joueur relayé', () => {
    const afk = new AfkSubstitution(tracker({ h1: true }));
    const { runtime, handle } = fakeRuntime({
      players: [{ playerId: 'h1', kind: 'human', status: 'ALIVE', substitute: 'normal' }],
    });
    afk.onPresence(runtime, 'h1', true);
    expect(handle).toHaveBeenCalledWith(
      { kind: 'system' },
      { type: 'RESUME_PLAYER', playerId: 'h1' },
    );
    afk.close();
  });

  it('ne touche ni aux bots, ni aux parties sans ce réglage ou d’avant ce réglage', async () => {
    const afk = new AfkSubstitution(tracker({ h1: false }));
    const off = fakeRuntime({ settings: { afkBotSeconds: null } });
    const legacy = fakeRuntime({ settings: {} });
    const botOnly = fakeRuntime({ round: { index: 0, expectedShooters: ['b1'], committed: {} } });
    for (const { runtime } of [off, legacy, botOnly]) afk.onEvents(runtime, []);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(off.handle).not.toHaveBeenCalled();
    expect(legacy.handle).not.toHaveBeenCalled();
    expect(botOnly.handle).not.toHaveBeenCalled();
    afk.close();
  });
});

describe('joueur absent : une commande du relais qui échoue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('est signalée avec sa partie et son joueur, sans promesse orpheline', async () => {
    const report = vi.fn();
    const afk = new AfkSubstitution(tracker({ h1: false }), report);
    const { runtime, handle, state } = fakeRuntime();
    handle.mockRejectedValue(new Error('panne simulée'));
    afk.onEvents(runtime, []);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ gameId: 'g1', playerId: 'h1' }),
    );

    report.mockClear();
    (state.players[0] as { substitute: string | null }).substitute = 'normal';
    afk.onPresence(runtime, 'h1', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ gameId: 'g1', playerId: 'h1' }),
    );
    afk.close();
  });
});
