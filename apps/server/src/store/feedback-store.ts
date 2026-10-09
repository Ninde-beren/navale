import type { DatabaseSync } from 'node:sqlite';

/** Un retour laissé par le bouton « Un avis ? », avec son contexte et l'état de son envoi par mail. */
export interface FeedbackRecord {
  id: number;
  at: number;
  message: string;
  email: string | null;
  path: string;
  code: string | null;
  screen: string | null;
  userAgent: string | null;
  version: string | null;
  /** Instant du départ du mail ; `null` tant qu'il n'est pas parti (pas de mail configuré, ou en panne). */
  sentAt: number | null;
}

/** Les retours des joueurs : gardés en base d'abord, rien ne se perd si le mail échoue. */
export class FeedbackStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        message TEXT NOT NULL,
        email TEXT,
        path TEXT NOT NULL,
        code TEXT,
        screen TEXT,
        user_agent TEXT,
        version TEXT,
        sent_at INTEGER
      );
    `);
  }

  /** Enregistre un retour et le renvoie avec son numéro. */
  save(input: Omit<FeedbackRecord, 'id' | 'sentAt'>): FeedbackRecord {
    const result = this.db
      .prepare(
        `INSERT INTO feedback (at, message, email, path, code, screen, user_agent, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.at,
        input.message,
        input.email,
        input.path,
        input.code,
        input.screen,
        input.userAgent,
        input.version,
      );
    return { ...input, id: Number(result.lastInsertRowid), sentAt: null };
  }

  markSent(id: number, at: number): void {
    this.db.prepare('UPDATE feedback SET sent_at = ? WHERE id = ?').run(at, id);
  }

  /** Les derniers retours, du plus récent au plus ancien. */
  recent(limit = 50): FeedbackRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      at: Number(r.at),
      message: String(r.message),
      email: (r.email as string | null) ?? null,
      path: String(r.path),
      code: (r.code as string | null) ?? null,
      screen: (r.screen as string | null) ?? null,
      userAgent: (r.user_agent as string | null) ?? null,
      version: (r.version as string | null) ?? null,
      sentAt: r.sent_at == null ? null : Number(r.sent_at),
    }));
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number };
    return Number(row.n);
  }
}
