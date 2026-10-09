import type { DatabaseSync } from 'node:sqlite';
import type { EventEnvelope, GameEvent, GameStatus } from '@navale/protocol';

export interface StoredGame {
  gameId: string;
  code: string;
  status: GameStatus;
  events: EventEnvelope[];
}

/**
 * Journal des parties : une ligne par événement, en ajout seul. L'état d'une
 * partie ne se sauvegarde pas, il se reconstruit en rejouant son journal (`evolve`).
 */
export class EventStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        game_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        at INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (game_id, seq)
      );
      CREATE INDEX IF NOT EXISTS events_type ON events (type, at);
    `);
  }

  createGame(gameId: string, code: string, status: GameStatus, now: number): void {
    this.db
      .prepare(
        'INSERT INTO games (game_id, code, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(gameId, code, status, now, now);
  }

  updateGame(gameId: string, status: GameStatus, now: number): void {
    this.db
      .prepare('UPDATE games SET status = ?, updated_at = ? WHERE game_id = ?')
      .run(status, now, gameId);
  }

  /** Ajoute un lot d'événements d'un coup : tout ou rien. */
  append(gameId: string, envelopes: EventEnvelope[]): void {
    const insert = this.db.prepare(
      'INSERT INTO events (game_id, seq, at, type, payload) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.exec('BEGIN');
    try {
      for (const e of envelopes)
        insert.run(gameId, e.seq, e.at, e.event.type, JSON.stringify(e.event));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Parties non terminées, avec leur journal complet, pour la reprise au démarrage. */
  loadActiveGames(): StoredGame[] {
    const games = this.db
      .prepare(
        "SELECT game_id, code, status FROM games WHERE status IN ('LOBBY', 'PLAYING') ORDER BY created_at",
      )
      .all() as Array<{ game_id: string; code: string; status: GameStatus }>;
    const select = this.db.prepare(
      'SELECT seq, at, payload FROM events WHERE game_id = ? ORDER BY seq',
    );
    return games.map((g) => ({
      gameId: g.game_id,
      code: g.code,
      status: g.status,
      events: (select.all(g.game_id) as Array<{ seq: number; at: number; payload: string }>).map(
        (r) => ({
          seq: r.seq,
          at: r.at,
          event: JSON.parse(r.payload) as GameEvent,
        }),
      ),
    }));
  }
}
