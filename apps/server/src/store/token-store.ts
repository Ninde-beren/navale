import type { DatabaseSync } from 'node:sqlite';

export type TokenRole = 'host' | 'player';
export interface TokenRecord {
  token: string;
  gameId: string;
  role: TokenRole;
  playerId: string | null;
}

/** Jetons des navigateurs : qui est l'hôte, qui est quel joueur, partie par partie. */
export class TokenStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        role TEXT NOT NULL,
        player_id TEXT
      );
      CREATE INDEX IF NOT EXISTS tokens_game ON tokens (game_id);
    `);
  }

  save(record: TokenRecord): void {
    this.db
      .prepare('INSERT INTO tokens (token, game_id, role, player_id) VALUES (?, ?, ?, ?)')
      .run(record.token, record.gameId, record.role, record.playerId);
  }

  find(token: string): TokenRecord | null {
    const row = this.db
      .prepare('SELECT token, game_id, role, player_id FROM tokens WHERE token = ?')
      .get(token) as
      { token: string; game_id: string; role: TokenRole; player_id: string | null } | undefined;
    return row
      ? { token: row.token, gameId: row.game_id, role: row.role, playerId: row.player_id }
      : null;
  }

  deletePlayer(gameId: string, playerId: string): void {
    this.db.prepare('DELETE FROM tokens WHERE game_id = ? AND player_id = ?').run(gameId, playerId);
  }

  /** Revanche : les jetons de l'ancienne partie ouvrent la nouvelle. */
  move(fromGameId: string, toGameId: string): void {
    this.db.prepare('UPDATE tokens SET game_id = ? WHERE game_id = ?').run(toGameId, fromGameId);
  }

  deleteGame(gameId: string): void {
    this.db.prepare('DELETE FROM tokens WHERE game_id = ?').run(gameId);
  }
}
