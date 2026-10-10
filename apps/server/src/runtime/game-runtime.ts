import { randomUUID } from 'node:crypto';
import {
  battleship,
  type Actor,
  type DecideContext,
  type Decision,
  type GameState,
} from '@navale/engine';
import type { Command, EventEnvelope, GameEvent } from '@navale/protocol';
import type { EventStore } from '../store/event-store.js';

/** Ce que le serveur fournit au moteur pour décider : l'heure, le hasard, les identifiants. */
export function decideContext(actor: Actor, now: number): DecideContext {
  return { actor, now, random: Math.random, newId: () => randomUUID() };
}

export interface RuntimeHooks {
  /**
   * Appelé après chaque lot d'événements journalisés et appliqués. Ne doit pas lever :
   * la commande est déjà passée (`app.ts` isole chacune de ses suites).
   */
  onEvents(runtime: GameRuntime, envelopes: EventEnvelope[]): void;
}

/**
 * Une partie vivante : decide → evolve → append → publish, une commande à la
 * fois par partie. L'état en mémoire n'est modifié qu'ici.
 */
export class GameRuntime {
  private queue: Promise<unknown> = Promise.resolve();
  /** Horodatage du dernier événement, pour l'expiration. */
  public lastActivityAt: number;

  constructor(
    public readonly gameId: string,
    public state: GameState,
    private readonly store: EventStore,
    private readonly hooks: RuntimeHooks,
    lastActivityAt: number = Date.now(),
  ) {
    this.lastActivityAt = lastActivityAt;
  }

  get code(): string {
    return this.state.code;
  }

  /** Sérialise les commandes : deux commandes concurrentes sont traitées l'une après l'autre. */
  handle(actor: Actor, command: Command): Promise<Decision<GameEvent>> {
    const run = this.queue.then(() => this.process(actor, command));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private process(actor: Actor, command: Command): Decision<GameEvent> {
    const now = Date.now();
    const decision = battleship.decide(this.state, command, decideContext(actor, now));
    if (!decision.ok || decision.events.length === 0) return decision;
    const envelopes: EventEnvelope[] = decision.events.map((event, i) => ({
      seq: this.state.seq + i + 1,
      at: now,
      event,
    }));
    // L'état suivant est calculé en entier avant d'écrire quoi que ce soit : si `evolve` lève,
    // le journal et l'état en mémoire restent tels quels, et le journal reste rejouable.
    const next = decision.events.reduce((state, e) => battleship.evolve(state, e), this.state);
    this.store.append(this.gameId, envelopes, next.status);
    this.state = next;
    this.lastActivityAt = now;
    this.hooks.onEvents(this, envelopes);
    return decision;
  }

  /** Rejoue un journal (reprise après redémarrage). */
  static replay(
    gameId: string,
    envelopes: EventEnvelope[],
    store: EventStore,
    hooks: RuntimeHooks,
  ): GameRuntime {
    const created = envelopes[0]?.event;
    if (created?.type !== 'GAME_CREATED') throw new Error(`journal de ${gameId} sans GAME_CREATED`);
    let state = battleship.initialState({
      gameId: created.gameId,
      code: created.code,
      settings: created.settings,
      createdAt: created.createdAt,
    });
    for (const e of envelopes) state = battleship.evolve(state, e.event);
    return new GameRuntime(
      gameId,
      state,
      store,
      hooks,
      envelopes[envelopes.length - 1]?.at ?? Date.now(),
    );
  }
}
