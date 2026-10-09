import { battleship, chooseShot, type Player } from '@navale/engine';
import type { EventEnvelope, GameEventOf, Variant } from '@navale/protocol';
import type { GameRuntime } from './game-runtime.js';

/** Le pilote joue pour les bots et pour les humains absents relayés par un bot. */
function botControlled(player: Player | undefined): player is Player {
  return player !== undefined && (player.kind === 'bot' || player.substitute !== null);
}

/** Réflexion : 1 à 2 s après son tour en séquentiel, 1 à 3 s après l'ouverture de la manche en salve. */
export function defaultThinkMs(variant: Variant): number {
  return 1000 + Math.random() * (variant === 'simultaneous' ? 2000 : 1000);
}

export interface BotDriverOptions {
  /** Quand l'écran central aura fini d'annoncer les tirs déjà publiés (`Publisher.settledAt`). */
  settledAt: (gameId: string) => number;
  thinkMs?: (variant: Variant) => number;
  log?: (message: string) => void;
}

/**
 * Pilote des bots : à chaque manche où un bot est attendu, attend que l'écran
 * central ait fini d'annoncer, puis un délai de réflexion, et envoie FIRE par la
 * même voie qu'un humain, à partir de la seule vue privée du bot : il ne peut pas tricher.
 * Un humain absent relayé par un bot (`substitute`) est joué de la même façon, à
 * partir de sa propre vue, jusqu'à son retour.
 */
export class BotDriver {
  /** Un tir programmé par bot, sous la clé `gameId:botId`. */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly settledAt: (gameId: string) => number;
  private readonly thinkMs: (variant: Variant) => number;
  private readonly log: (message: string) => void;

  constructor(options: BotDriverOptions) {
    this.settledAt = options.settledAt;
    this.thinkMs = options.thinkMs ?? defaultThinkMs;
    this.log = options.log ?? (() => undefined);
  }

  onEvents(runtime: GameRuntime, envelopes: EventEnvelope[]): void {
    const events = envelopes.map((e) => e.event);
    if (events.some((e) => e.type === 'GAME_FINISHED' || e.type === 'GAME_CANCELLED')) {
      this.cancel(runtime.gameId);
      return;
    }
    const started = events.find(
      (e): e is GameEventOf<'ROUND_STARTED'> => e.type === 'ROUND_STARTED',
    );
    if (started) this.schedule(runtime, started.round, started.expectedShooters);
    // Un absent relayé en pleine manche : le bot joue tout de suite ce qu'on attend de lui ;
    // un revenant reprend la main, le tir programmé pour lui est oublié.
    for (const e of events) {
      if (e.type === 'PLAYER_SUBSTITUTED' && runtime.state.round)
        this.schedule(runtime, runtime.state.round.index, [e.playerId]);
      if (e.type === 'PLAYER_RESUMED') this.unschedule(runtime.gameId, e.playerId);
    }
  }

  /** Reprise après redémarrage : les bots attendus dans la manche courante rejouent. */
  resume(runtime: GameRuntime): void {
    const { status, round } = runtime.state;
    if (status === 'PLAYING' && round) this.schedule(runtime, round.index, round.expectedShooters);
  }

  private schedule(runtime: GameRuntime, roundIndex: number, expectedShooters: string[]): void {
    const { state, gameId } = runtime;
    const announced = Math.max(0, this.settledAt(gameId) - Date.now());
    for (const botId of expectedShooters) {
      const bot = state.players.find((p) => p.playerId === botId);
      if (!botControlled(bot) || state.round?.committed[botId]) continue;
      const key = `${gameId}:${botId}`;
      clearTimeout(this.timers.get(key));
      const timer = setTimeout(
        () => {
          this.timers.delete(key);
          void this.fire(runtime, botId, roundIndex);
        },
        announced + this.thinkMs(state.settings.variant),
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
    const { state } = runtime;
    const round = state.round;
    if (state.status !== 'PLAYING' || round?.index !== roundIndex) return;
    if (!round.expectedShooters.includes(botId) || round.committed[botId]) return;
    if (!botControlled(state.players.find((p) => p.playerId === botId))) return;
    const shot = chooseShot(battleship.projectPrivate(state, botId), Math.random);
    if (!shot) return;
    const decision = await runtime.handle(
      { kind: 'player', playerId: botId },
      { type: 'FIRE', targetId: shot.targetId, coord: shot.coord },
    );
    if (!decision.ok) {
      // Un refus ici est une erreur de programmation de la stratégie : on le journalise et on retire une fois.
      this.log(`bot ${botId} refusé (${decision.rejection.code}) : ${decision.rejection.message}`);
      if (attempt < 1) await this.fire(runtime, botId, roundIndex, attempt + 1);
    }
  }

  private unschedule(gameId: string, playerId: string): void {
    const key = `${gameId}:${playerId}`;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
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
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
