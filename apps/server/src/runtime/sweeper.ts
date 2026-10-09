import { battleship } from '@navale/engine';
import type { GameRegistry } from '../store/registry.js';

export interface ExpiryPolicy {
  /** Lobby sans activité. */
  lobbyMs: number;
  /** Partie en cours sans événement. */
  playingMs: number;
  /** Partie terminée ou annulée, avant d'être oubliée. */
  finishedMs: number;
  /** Période de la ronde ; 0 pour ne balayer qu'à la demande (tests). */
  intervalMs: number;
}

export const DEFAULT_EXPIRY: ExpiryPolicy = {
  lobbyMs: 2 * 60 * 60 * 1000,
  playingMs: 6 * 60 * 60 * 1000,
  finishedMs: 24 * 60 * 60 * 1000,
  intervalMs: 60 * 1000,
};

/** Expiration des parties inactives : annulation par le système, puis oubli. Libère les codes. */
export class Sweeper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly registry: GameRegistry,
    private readonly policy: ExpiryPolicy = DEFAULT_EXPIRY,
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  start(): void {
    if (this.policy.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.policy.intervalMs);
    this.timer.unref();
  }

  async sweep(now: number = Date.now()): Promise<{ cancelled: string[]; forgotten: string[] }> {
    const cancelled: string[] = [];
    const forgotten: string[] = [];
    for (const runtime of this.registry.all()) {
      const idle = now - runtime.lastActivityAt;
      const { status } = runtime.state;
      if (battleship.isFinished(runtime.state)) {
        if (idle > this.policy.finishedMs) {
          this.registry.forget(runtime.gameId);
          forgotten.push(runtime.code);
        }
        continue;
      }
      if (idle <= (status === 'LOBBY' ? this.policy.lobbyMs : this.policy.playingMs)) continue;
      const decision = await runtime.handle({ kind: 'system' }, { type: 'CANCEL_GAME' });
      if (decision.ok) {
        cancelled.push(runtime.code);
        this.log(
          `partie ${runtime.code} expirée (${status}, ${Math.round(idle / 60000)} min d'inactivité)`,
        );
      }
    }
    return { cancelled, forgotten };
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
