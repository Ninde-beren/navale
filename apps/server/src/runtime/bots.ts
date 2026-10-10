import { battleship, chooseAction, chooseBet, type Player } from '@navale/engine';
import type { EventEnvelope, GameEventOf, Variant } from '@navale/protocol';
import { contain, type ReportFailure } from './failure.js';
import type { GameRuntime } from './game-runtime.js';

/** Le pilote joue pour les bots et pour les humains absents relayés par un bot. */
function botControlled(player: Player | undefined): player is Player {
  return player !== undefined && (player.kind === 'bot' || player.substitute !== null);
}

/** Réflexion : 1 à 2 s après son tour en séquentiel, 1 à 3 s après l'ouverture de la manche en salve. */
export function defaultThinkMs(variant: Variant): number {
  return 1000 + Math.random() * (variant === 'simultaneous' ? 2000 : 1000);
}

/** Le temps laissé en plus à un humain fantôme pour pronostiquer le tir d'un bot. */
const GHOST_GRACE_MS = 2500;

/** Un bot fantôme pronostique vite, avant le tir qu'il pronostique : 0,3 à 1 s après l'annonce. */
export function defaultBetMs(): number {
  return 300 + Math.random() * 700;
}

export interface BotDriverOptions {
  /** Quand l'écran central aura fini d'annoncer les tirs déjà publiés (`Publisher.settledAt`). */
  settledAt: (gameId: string) => number;
  thinkMs?: (variant: Variant) => number;
  betMs?: () => number;
  log?: (message: string) => void;
  /** Un tir qui lève, hors de toute requête : signalé, la partie suivante continue. */
  report?: ReportFailure;
}

/**
 * Pilote des bots : à chaque manche où un bot est attendu, attend que l'écran
 * central ait fini d'annoncer, puis un délai de réflexion, et envoie FIRE par la
 * même voie qu'un humain, à partir de la seule vue privée du bot : il ne peut pas tricher.
 * Un humain absent relayé par un bot (`substitute`) est joué de la même façon, à
 * partir de sa propre vue, jusqu'à son retour ; seul un vrai bot joue sa capacité, le
 * relais ne dépense pas celle de l'absent.
 */
export class BotDriver {
  /** Un tir programmé par bot, sous la clé `gameId:botId`. */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly settledAt: (gameId: string) => number;
  private readonly thinkMs: (variant: Variant) => number;
  private readonly betMs: () => number;
  private readonly log: (message: string) => void;
  private readonly report: ReportFailure;

  constructor(options: BotDriverOptions) {
    this.settledAt = options.settledAt;
    this.thinkMs = options.thinkMs ?? defaultThinkMs;
    this.betMs = options.betMs ?? defaultBetMs;
    this.log = options.log ?? (() => undefined);
    this.report = options.report ?? (() => undefined);
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
    if (started) {
      this.schedule(runtime, started.round, started.expectedShooters);
      this.scheduleBets(runtime, started.round);
    }
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
    if (status === 'PLAYING' && round) {
      this.schedule(runtime, round.index, round.expectedShooters);
      this.scheduleBets(runtime, round.index);
    }
  }

  /** Les bots éliminés d'une partie à fantômes pronostiquent chaque manche, sur la vue publique. */
  private scheduleBets(runtime: GameRuntime, roundIndex: number): void {
    const { state, gameId } = runtime;
    if (state.settings.eliminated !== 'ghosts') return;
    const announced = Math.max(0, this.settledAt(gameId) - Date.now());
    for (const ghost of state.players) {
      if (ghost.kind !== 'bot' || ghost.status !== 'ELIMINATED') continue;
      const key = `${gameId}:${ghost.playerId}:bet`;
      clearTimeout(this.timers.get(key));
      const timer = setTimeout(() => {
        this.timers.delete(key);
        contain(this.report, { gameId, during: 'pronostic du bot', playerId: ghost.playerId }, () =>
          this.bet(runtime, ghost.playerId, roundIndex),
        );
      }, announced + this.betMs());
      this.timers.set(key, timer);
    }
  }

  private async bet(runtime: GameRuntime, botId: string, roundIndex: number): Promise<void> {
    const { state } = runtime;
    if (state.status !== 'PLAYING' || state.round?.index !== roundIndex) return;
    const view = battleship.projectPrivate(state, botId);
    if (!view.me.canBet || view.me.bet !== null) return;
    const decision = await runtime.handle(
      { kind: 'player', playerId: botId },
      { type: 'PLACE_BET', round: roundIndex, bet: chooseBet(view) },
    );
    if (!decision.ok)
      this.log(`bot ${botId} refusé (${decision.rejection.code}) : ${decision.rejection.message}`);
  }

  private schedule(runtime: GameRuntime, roundIndex: number, expectedShooters: string[]): void {
    const { state, gameId } = runtime;
    const announced = Math.max(0, this.settledAt(gameId) - Date.now());
    // Un humain fantôme pronostique le tir du bot : il lui faut le temps de taper.
    const grace = state.players.some(
      (p) =>
        p.kind === 'human' && p.status === 'ELIMINATED' && state.settings.eliminated === 'ghosts',
    )
      ? GHOST_GRACE_MS
      : 0;
    for (const botId of expectedShooters) {
      const bot = state.players.find((p) => p.playerId === botId);
      if (!botControlled(bot) || state.round?.committed[botId]) continue;
      const key = `${gameId}:${botId}`;
      clearTimeout(this.timers.get(key));
      const timer = setTimeout(
        () => {
          this.timers.delete(key);
          contain(this.report, { gameId, during: 'tir du bot', playerId: botId }, () =>
            this.fire(runtime, botId, roundIndex),
          );
        },
        announced + grace + this.thinkMs(state.settings.variant),
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
    const player = state.players.find((p) => p.playerId === botId);
    if (!botControlled(player)) return;
    const view = battleship.projectPrivate(state, botId);
    const action = chooseAction(view, Math.random, undefined, player.kind === 'bot');
    if (!action) return;
    const { targetId, coord } = action;
    const decision = await runtime.handle(
      { kind: 'player', playerId: botId },
      action.ability ? { type: 'USE_ABILITY', targetId, coord } : { type: 'FIRE', targetId, coord },
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
