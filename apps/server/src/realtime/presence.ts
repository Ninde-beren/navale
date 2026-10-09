import type { Presence } from '@navale/engine';
import { gameRoom } from './rooms.js';
import type { GameServer } from './types.js';

/** Qui est connecté : compte des sockets par joueur, par partie. Niveau transport, jamais journalisé. */
export class PresenceTracker {
  private readonly counts = new Map<string, Map<string, number>>();
  /** Prévenu quand un joueur arrive ou perd sa dernière connexion (joueur absent). */
  onChange: ((gameId: string, playerId: string, connected: boolean) => void) | null = null;

  constructor(private readonly io: GameServer) {}

  private bucket(gameId: string): Map<string, number> {
    let m = this.counts.get(gameId);
    if (!m) {
      m = new Map();
      this.counts.set(gameId, m);
    }
    return m;
  }

  add(gameId: string, playerId: string): void {
    const m = this.bucket(gameId);
    const n = (m.get(playerId) ?? 0) + 1;
    m.set(playerId, n);
    if (n === 1) {
      this.io.to(gameRoom(gameId)).emit('presence', { playerId, connected: true });
      this.onChange?.(gameId, playerId, true);
    }
  }

  remove(gameId: string, playerId: string): void {
    const m = this.bucket(gameId);
    const n = (m.get(playerId) ?? 1) - 1;
    if (n <= 0) {
      m.delete(playerId);
      this.io.to(gameRoom(gameId)).emit('presence', { playerId, connected: false });
      this.onChange?.(gameId, playerId, false);
    } else m.set(playerId, n);
  }

  of(gameId: string): Presence {
    const out: Record<string, boolean> = {};
    for (const [id, n] of this.bucket(gameId)) out[id] = n > 0;
    return out;
  }
}
