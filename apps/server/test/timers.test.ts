import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRuntime } from '../src/runtime/game-runtime.js';
import { RoundTimers } from '../src/runtime/timers.js';

/** Un runtime factice : seul l'état et `handle` comptent pour le chrono. */
function fakeRuntime(deadline: number | null) {
  const handle = vi.fn(async () => ({ ok: true as const, events: [] }));
  const runtime = {
    gameId: 'g1',
    state: { status: 'PLAYING', round: { deadline } },
    handle,
  } as unknown as GameRuntime;
  return { runtime, handle };
}

describe('chrono de manche', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('force la manche à l’échéance, par le système', async () => {
    const timers = new RoundTimers(() => Date.now());
    const { runtime, handle } = fakeRuntime(Date.now() + 15_000);
    timers.reschedule(runtime);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(handle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(handle).toHaveBeenCalledWith({ kind: 'system' }, { type: 'FORCE_ROUND' });
    timers.close();
  });

  it('ne force pas une manche déjà résolue entre-temps, ni une partie sans chrono', async () => {
    const timers = new RoundTimers(() => Date.now());
    const { runtime, handle } = fakeRuntime(Date.now() + 15_000);
    timers.reschedule(runtime);
    (runtime as { state: { round: { deadline: number } } }).state.round.deadline =
      Date.now() + 40_000; // nouvelle manche
    await vi.advanceTimersByTimeAsync(16_000);
    expect(handle).not.toHaveBeenCalled();

    const idle = fakeRuntime(null);
    timers.reschedule(idle.runtime);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(idle.handle).not.toHaveBeenCalled();
    timers.close();
  });

  it('réarme en remplaçant le chrono précédent', async () => {
    const timers = new RoundTimers(() => Date.now());
    const { runtime, handle } = fakeRuntime(Date.now() + 15_000);
    timers.reschedule(runtime);
    (runtime as { state: { round: { deadline: number } } }).state.round.deadline =
      Date.now() + 20_000;
    timers.reschedule(runtime);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(handle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(handle).toHaveBeenCalledTimes(1);
    timers.close();
  });
});

describe('chrono de manche : un FORCE_ROUND qui échoue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('est signalé avec sa partie, sans promesse orpheline', async () => {
    const report = vi.fn();
    const timers = new RoundTimers(() => Date.now(), report);
    const { runtime, handle } = fakeRuntime(Date.now() + 1_000);
    handle.mockRejectedValue(new Error('panne simulée'));
    timers.reschedule(runtime);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ gameId: 'g1' }),
    );
    timers.close();
  });
});
