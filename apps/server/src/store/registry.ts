import { randomBytes, randomUUID } from 'node:crypto';
import { battleship } from '@navale/engine';
import type { GameSettings } from '@navale/protocol';
import { generateCode } from '../runtime/codes.js';
import { GameRuntime, type RuntimeHooks } from '../runtime/game-runtime.js';
import type { EventStore, TokenRecord, TokenRole } from './event-store.js';

/** Parties en mémoire, index des codes actifs, jetons. */
export class GameRegistry {
  private readonly byId = new Map<string, GameRuntime>();
  private readonly byCode = new Map<string, string>();

  constructor(
    private readonly store: EventStore,
    private readonly hooks: RuntimeHooks,
  ) {}

  /** Recharge les parties non terminées au démarrage. */
  restore(): number {
    let n = 0;
    for (const g of this.store.loadActiveGames()) {
      const runtime = GameRuntime.replay(g.gameId, g.events, this.store, this.hooks);
      this.byId.set(runtime.gameId, runtime);
      if (runtime.state.status === 'LOBBY' || runtime.state.status === 'PLAYING')
        this.byCode.set(runtime.code, runtime.gameId);
      n++;
    }
    return n;
  }

  create(settings: GameSettings): { runtime: GameRuntime; hostToken: string } {
    const now = Date.now();
    const gameId = randomUUID();
    const code = generateCode((c) => this.byCode.has(c));
    const state = battleship.initialState({ gameId, code, settings, createdAt: now });
    this.store.createGame(gameId, code, 'LOBBY', now);
    const runtime = new GameRuntime(gameId, state, this.store, this.hooks);
    this.byId.set(gameId, runtime);
    this.byCode.set(code, gameId);
    // GAME_CREATED ouvre le journal ; la commande n'existe pas, on l'ajoute directement.
    this.store.append(gameId, [
      { seq: 1, at: now, event: { type: 'GAME_CREATED', gameId, code, settings, createdAt: now } },
    ]);
    runtime.state = battleship.evolve(runtime.state, {
      type: 'GAME_CREATED',
      gameId,
      code,
      settings,
      createdAt: now,
    });
    const hostToken = this.issueToken(gameId, 'host', null);
    return { runtime, hostToken };
  }

  issueToken(gameId: string, role: TokenRole, playerId: string | null): string {
    const token = randomBytes(32).toString('base64url');
    this.store.saveToken({ token, gameId, role, playerId });
    return token;
  }

  resolveToken(token: string): TokenRecord | null {
    return this.store.findToken(token);
  }

  revokePlayer(gameId: string, playerId: string): void {
    this.store.deletePlayerTokens(gameId, playerId);
  }

  get(gameId: string): GameRuntime | undefined {
    return this.byId.get(gameId);
  }

  byActiveCode(code: string): GameRuntime | undefined {
    const id = this.byCode.get(code);
    return id ? this.byId.get(id) : undefined;
  }

  /** À appeler après chaque lot d'événements : libère le code d'une partie terminée. */
  sync(runtime: GameRuntime): void {
    if (runtime.state.status === 'FINISHED' || runtime.state.status === 'CANCELLED') {
      if (this.byCode.get(runtime.code) === runtime.gameId) this.byCode.delete(runtime.code);
    }
  }

  /** Oublie une partie terminée : retirée de la mémoire, jetons supprimés, journal conservé. */
  forget(gameId: string): void {
    const runtime = this.byId.get(gameId);
    if (!runtime) return;
    this.byId.delete(gameId);
    if (this.byCode.get(runtime.code) === gameId) this.byCode.delete(runtime.code);
    this.store.deleteGameTokens(gameId);
  }

  all(): GameRuntime[] {
    return [...this.byId.values()];
  }
}
