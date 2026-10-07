import { battleship, chooseShot } from '@navale/engine';
import type { EventEnvelope, GameEventOf, Variant } from '@navale/protocol';
import type { GameRuntime } from './game-runtime.js';

/** Réflexion : 1 à 2 s après son tour en séquentiel, 1 à 3 s après l'ouverture de la manche en salve. */
export function defaultThinkMs(variant: Variant): number {
  return 1000 + Math.random() * (variant === 'simultaneous' ? 2000 : 1000);
}

/**
 * Pilote des bots : à chaque manche où un bot est attendu, attend la fin de la
 * cadence de publication puis un délai de réflexion, et envoie FIRE par la même
 * voie qu'un humain, à partir de la seule vue privée du bot (ADR-012).
 */
export class BotDriver {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly thinkMs: (variant: Variant) => number = defaultThinkMs,
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  onEvents(runtime: GameRuntime, envelopes: EventEnvelope[]): void {
    if (
      envelopes.some((e) => e.event.type === 'GAME_FINISHED' || e.event.type === 'GAME_CANCELLED')
    ) {
      this.cancel(runtime.gameId);
      return;
    }
    const shots = envelopes.filter((e) => e.event.type === 'SHOT_RESOLVED').length;
    const started = envelopes
      .map((e) => e.event)
      .find((e): e is GameEventOf<'ROUND_STARTED'> => e.type === 'ROUND_STARTED');
    if (started)
      this.schedule(
        runtime,
        started.round,
        started.expectedShooters,
        shots * runtime.state.settings.revealDelayMs,
      );
  }

  /** Reprise après redémarrage : les bots attendus dans la manche courante rejouent. */
  resume(runtime: GameRuntime): void {
    const round = runtime.state.round;
    if (runtime.state.status === 'PLAYING' && round)
      this.schedule(runtime, round.index, round.expectedShooters, 0);
  }

  private schedule(
    runtime: GameRuntime,
    roundIndex: number,
    expected: string[],
    baseDelay: number,
  ): void {
    for (const id of expected) {
      const p = runtime.state.players.find((x) => x.playerId === id);
      if (!p || p.kind !== 'bot' || runtime.state.round?.committed[id]) continue;
      const key = `${runtime.gameId}:${id}`;
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(
        () => {
          this.timers.delete(key);
          void this.fire(runtime, id, roundIndex);
        },
        baseDelay + this.thinkMs(runtime.state.settings.variant),
      );
      this.timers.set(key, timer);
    }
  }

  private async fire(
    runtime: GameRuntime,
    botId: string,
    roundIndex: number,
    attempt = 0,
  ): Promise<void> {
    const s = runtime.state;
    if (s.status !== 'PLAYING' || !s.round || s.round.index !== roundIndex) return;
    if (!s.round.expectedShooters.includes(botId) || s.round.committed[botId]) return;
    const shot = chooseShot(battleship.projectPrivate(s, botId), Math.random);
    if (!shot) return;
    const d = await runtime.handle(
      { kind: 'player', playerId: botId },
      { type: 'FIRE', targetId: shot.targetId, coord: shot.coord },
    );
    if (!d.ok) {
      // Un refus ici est une erreur de programmation de la stratégie : on le journalise et on retire une fois.
      this.log(`bot ${botId} refusé (${d.rejection.code}) : ${d.rejection.message}`);
      if (attempt < 1) await this.fire(runtime, botId, roundIndex, attempt + 1);
    }
  }

  private cancel(gameId: string): void {
    for (const [key, timer] of this.timers) {
      if (key.startsWith(`${gameId}:`)) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }

  close(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
