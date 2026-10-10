import { battleship } from '@navale/engine';
import { contain, type ReportFailure } from './failure.js';
import type { GameRuntime } from './game-runtime.js';

/**
 * Chrono de manche : à l'échéance donnée par le moteur, l'acteur `system`
 * envoie FORCE_ROUND. Réarmé après chaque lot d'événements et à la reprise.
 */
export class RoundTimers {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly report: ReportFailure = () => undefined,
  ) {}

  reschedule(runtime: GameRuntime): void {
    const existing = this.timers.get(runtime.gameId);
    if (existing) clearTimeout(existing);
    this.timers.delete(runtime.gameId);
    const at = battleship.nextDeadline(runtime.state);
    if (at === null) return;
    const timer = setTimeout(
      () => {
        this.timers.delete(runtime.gameId);
        contain(this.report, { gameId: runtime.gameId, during: 'chrono de manche' }, () =>
          this.fire(runtime, at),
        );
      },
      Math.max(0, at - this.now()),
    );
    this.timers.set(runtime.gameId, timer);
  }

  private async fire(runtime: GameRuntime, at: number): Promise<void> {
    // La manche a peut-être déjà été résolue entre-temps : on ne force que celle qui portait cette échéance.
    if (runtime.state.status !== 'PLAYING' || runtime.state.round?.deadline !== at) return;
    await runtime.handle({ kind: 'system' }, { type: 'FORCE_ROUND' });
  }

  close(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
