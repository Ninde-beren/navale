import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { battleship } from '@navale/engine';
import {
  GAME_CODE_ALPHABET,
  GAME_CODE_LENGTH,
  isGameCode,
  normalizeGameCode,
  type EventEnvelope,
  type GameEvent,
  type GameSettings,
} from '@navale/protocol';
import { GameRuntime, type RuntimeHooks } from '../runtime/game-runtime.js';
import type { EventStore } from './event-store.js';
import type { TokenRecord, TokenRole, TokenStore } from './token-store.js';

/** Un code libre tiré au hasard : ce que les joueurs saisissent ou scannent. */
function freeCode(taken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const code = Array.from(
      { length: GAME_CODE_LENGTH },
      () => GAME_CODE_ALPHABET[randomInt(GAME_CODE_ALPHABET.length)],
    ).join('');
    if (!taken(code)) return code;
  }
  throw new Error('plus de code de partie disponible');
}

/** Parties en mémoire, index des codes actifs, jetons. */
export class GameRegistry {
  private readonly byId = new Map<string, GameRuntime>();
  private readonly byCode = new Map<string, string>();

  constructor(
    private readonly store: EventStore,
    private readonly tokens: TokenStore,
    private readonly hooks: RuntimeHooks,
  ) {}

  /** Recharge les parties non terminées au démarrage. */
  restore(): number {
    let n = 0;
    for (const g of this.store.loadActiveGames()) {
      const runtime = GameRuntime.replay(g.gameId, g.events, this.store, this.hooks);
      this.byId.set(runtime.gameId, runtime);
      if (!battleship.isFinished(runtime.state)) this.byCode.set(runtime.code, runtime.gameId);
      n++;
    }
    return n;
  }

  /** Nouvelle partie, avec un code libre et le jeton de son hôte. */
  create(settings: GameSettings): { runtime: GameRuntime; hostToken: string } {
    const now = Date.now();
    const gameId = randomUUID();
    const code = freeCode((c) => this.byCode.has(c));
    // GAME_CREATED ouvre le journal : aucune commande ne le produit, on l'écrit directement.
    const created: GameEvent = { type: 'GAME_CREATED', gameId, code, settings, createdAt: now };
    const runtime = this.createFromEvents(gameId, [created], now);
    return { runtime, hostToken: this.issueToken(gameId, 'host', null) };
  }

  /** Ouvre une partie à partir de son journal initial : une création, ou une revanche qui garde son code. */
  createFromEvents(gameId: string, events: GameEvent[], now: number): GameRuntime {
    const created = events[0];
    if (created?.type !== 'GAME_CREATED') throw new Error('journal initial sans GAME_CREATED');
    if (this.byCode.has(created.code) || this.byId.has(gameId))
      throw new Error(`code ${created.code} ou partie ${gameId} déjà actifs`);
    const envelopes: EventEnvelope[] = events.map((event, i) => ({ seq: i + 1, at: now, event }));
    this.store.createGame(gameId, created.code, 'LOBBY', now);
    this.store.append(gameId, envelopes);
    const runtime = GameRuntime.replay(gameId, envelopes, this.store, this.hooks);
    this.byId.set(gameId, runtime);
    this.byCode.set(created.code, gameId);
    return runtime;
  }

  /** Revanche : les jetons de l'ancienne partie ouvrent la nouvelle, mêmes identifiants de joueurs. */
  moveTokens(fromGameId: string, toGameId: string): void {
    this.tokens.move(fromGameId, toGameId);
  }

  issueToken(gameId: string, role: TokenRole, playerId: string | null): string {
    const token = randomBytes(32).toString('base64url');
    this.tokens.save({ token, gameId, role, playerId });
    return token;
  }

  resolveToken(token: string): TokenRecord | null {
    return this.tokens.find(token);
  }

  revokePlayer(gameId: string, playerId: string): void {
    this.tokens.deletePlayer(gameId, playerId);
  }

  get(gameId: string): GameRuntime | undefined {
    return this.byId.get(gameId);
  }

  /** La partie ouverte (lobby ou en cours) qui porte ce code, tel que saisi ou scanné. */
  findByCode(raw: string): GameRuntime | undefined {
    const code = normalizeGameCode(raw);
    const gameId = isGameCode(code) ? this.byCode.get(code) : undefined;
    return gameId ? this.byId.get(gameId) : undefined;
  }

  /** À appeler après chaque lot d'événements : libère le code d'une partie terminée. */
  sync(runtime: GameRuntime): void {
    if (battleship.isFinished(runtime.state) && this.byCode.get(runtime.code) === runtime.gameId)
      this.byCode.delete(runtime.code);
  }

  /** Oublie une partie terminée : retirée de la mémoire, jetons supprimés, journal conservé. */
  forget(gameId: string): void {
    const runtime = this.byId.get(gameId);
    if (!runtime) return;
    this.byId.delete(gameId);
    if (this.byCode.get(runtime.code) === gameId) this.byCode.delete(runtime.code);
    this.tokens.deleteGame(gameId);
  }

  all(): GameRuntime[] {
    return [...this.byId.values()];
  }
}
