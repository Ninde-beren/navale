import type { DatabaseSync } from 'node:sqlite';
import type { GameEvent, GameEventOf, Variant } from '@navale/protocol';

/** Issue d'une partie lancée, pour l'historique de l'administration. */
export type PlayedOutcome = 'playing' | 'finished' | 'cancelled' | 'expired';

export interface PlayedGame {
  gameId: string;
  code: string;
  variant: Variant;
  startedAt: number;
  /**
   * Dernière action de jeu, fin comprise ; `null` tant que la partie se joue.
   * L'annulation n'en est pas une : l'attente avant l'expiration ne compte pas.
   */
  playedUntil: number | null;
  outcome: PlayedOutcome;
  /** Identifiants des humains assis au départ ; une revanche garde les mêmes. */
  humans: string[];
  bots: number;
  shots: number;
}

/**
 * L'historique des parties jouées, lu dans le journal : en lecture seule, pour
 * l'administration. Le journal reste la seule source ; rien n'est recopié ailleurs.
 */
export class GameHistory {
  constructor(private readonly db: DatabaseSync) {}

  /** Parties lancées (`GAME_STARTED`), de la plus récente à la plus ancienne. */
  playedGames(): PlayedGame[] {
    const started = this.db
      .prepare(
        `SELECT e.game_id, e.at, e.payload, g.code FROM events e
         JOIN games g ON g.game_id = e.game_id
         WHERE e.type = 'GAME_STARTED' ORDER BY e.at DESC`,
      )
      .all() as Array<{ game_id: string; at: number; payload: string; code: string }>;
    const joined = this.db.prepare(
      "SELECT payload FROM events WHERE game_id = ? AND type = 'PLAYER_JOINED'",
    );
    const ended = this.db.prepare(
      "SELECT at, payload FROM events WHERE game_id = ? AND type IN ('GAME_FINISHED', 'GAME_CANCELLED')",
    );
    const activity = this.db.prepare(
      `SELECT SUM(type = 'SHOT_RESOLVED') AS shots,
         MAX(CASE WHEN type NOT IN ('GAME_CANCELLED', 'REMATCH_CREATED') THEN at END) AS last
       FROM events WHERE game_id = ?`,
    );
    return started.map((row) => {
      const start = JSON.parse(row.payload) as GameEventOf<'GAME_STARTED'>;
      const kinds = new Map(
        (joined.all(row.game_id) as Array<{ payload: string }>).map((r) => {
          const e = JSON.parse(r.payload) as GameEventOf<'PLAYER_JOINED'>;
          return [e.playerId, e.kind] as const;
        }),
      );
      const humans = start.seats.filter((id) => kinds.get(id) === 'human');
      const end = ended.get(row.game_id) as { at: number; payload: string } | undefined;
      const { shots, last } = activity.get(row.game_id) as { shots: number; last: number };
      return {
        gameId: row.game_id,
        code: row.code,
        variant: start.settings.variant,
        startedAt: row.at,
        playedUntil: end ? last : null,
        outcome: end ? outcomeOf(JSON.parse(end.payload) as GameEvent) : 'playing',
        humans,
        bots: start.seats.length - humans.length,
        shots,
      };
    });
  }
}

function outcomeOf(end: GameEvent): PlayedOutcome {
  if (end.type === 'GAME_FINISHED') return 'finished';
  return end.type === 'GAME_CANCELLED' && end.reason === 'expired' ? 'expired' : 'cancelled';
}
