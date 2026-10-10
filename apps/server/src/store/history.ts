import type { DatabaseSync } from 'node:sqlite';
import { normalizeSettings } from '@navale/engine';
import type {
  BotLevel,
  GameEvent,
  GameEventOf,
  GameSettings,
  PlayerKind,
  Variant,
} from '@navale/protocol';

/** Issue d'une partie lancée, pour l'historique de l'administration. */
export type PlayedOutcome = 'playing' | 'finished' | 'cancelled' | 'expired';

/** Un siège au lancement : humain ou bot, et le commandant choisi au lobby. */
export interface PlayedSeat {
  playerId: string;
  kind: PlayerKind;
  /** Niveau d'un bot ; `null` pour un humain. */
  level: BotLevel | null;
  commanderId: string | null;
}

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
  /** Réglages au lancement, complétés pour les journaux d'avant un nouveau réglage. */
  settings: GameSettings;
  /** Réglages qui n'existaient pas encore au lancement : complétés, mais pas choisis. */
  unsetSettings: Array<keyof GameSettings>;
  /** Sièges dans l'ordre du lancement. */
  seats: PlayedSeat[];
  /** Vainqueur d'une partie terminée ; `null` sinon, ou sans vainqueur. */
  winnerId: string | null;
  /** La revanche ouverte depuis cette partie, lancée ou non. */
  rematchGameId: string | null;
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
    const lifecycle = this.db.prepare(
      `SELECT at, payload FROM events WHERE game_id = ? AND type IN
         ('PLAYER_JOINED', 'COMMANDER_CHOSEN', 'GAME_FINISHED', 'GAME_CANCELLED', 'REMATCH_CREATED')
       ORDER BY seq`,
    );
    const activity = this.db.prepare(
      `SELECT SUM(type = 'SHOT_RESOLVED') AS shots,
         MAX(CASE WHEN type NOT IN ('GAME_CANCELLED', 'REMATCH_CREATED') THEN at END) AS last
       FROM events WHERE game_id = ?`,
    );
    return started.map((row) => {
      const start = JSON.parse(row.payload) as GameEventOf<'GAME_STARTED'>;
      const joined = new Map<string, { kind: PlayerKind; level: BotLevel | null }>();
      const commanders = new Map<string, string>();
      let end: { at: number; event: GameEvent } | null = null;
      let rematchGameId: string | null = null;
      for (const r of lifecycle.all(row.game_id) as Array<{ at: number; payload: string }>) {
        const e = JSON.parse(r.payload) as GameEvent;
        if (e.type === 'PLAYER_JOINED')
          joined.set(e.playerId, {
            kind: e.kind,
            // Avant les niveaux, un bot jouait toujours au niveau normal.
            level: e.kind === 'bot' ? (e.level ?? 'normal') : null,
          });
        // Le choix se fait au lobby et peut changer : le dernier compte.
        else if (e.type === 'COMMANDER_CHOSEN') commanders.set(e.playerId, e.commanderId);
        else if (e.type === 'REMATCH_CREATED') rematchGameId = e.newGameId;
        else if (e.type === 'GAME_FINISHED' || e.type === 'GAME_CANCELLED')
          end = { at: r.at, event: e };
      }
      const seats: PlayedSeat[] = start.seats.map((playerId) => ({
        playerId,
        kind: joined.get(playerId)?.kind ?? 'human',
        level: joined.get(playerId)?.level ?? null,
        commanderId: commanders.get(playerId) ?? null,
      }));
      const humans = seats.filter((p) => p.kind === 'human').map((p) => p.playerId);
      const { shots, last } = activity.get(row.game_id) as { shots: number; last: number };
      return {
        gameId: row.game_id,
        code: row.code,
        variant: start.settings.variant,
        startedAt: row.at,
        playedUntil: end ? last : null,
        outcome: end ? outcomeOf(end.event) : 'playing',
        humans,
        bots: seats.length - humans.length,
        shots,
        settings: normalizeSettings(start.settings),
        unsetSettings: (
          Object.keys(normalizeSettings(start.settings)) as Array<keyof GameSettings>
        ).filter((key) => !(key in start.settings)),
        seats,
        winnerId: end?.event.type === 'GAME_FINISHED' ? end.event.winnerId : null,
        rematchGameId,
      };
    });
  }
}

function outcomeOf(end: GameEvent): PlayedOutcome {
  if (end.type === 'GAME_FINISHED') return 'finished';
  return end.type === 'GAME_CANCELLED' && end.reason === 'expired' ? 'expired' : 'cancelled';
}
