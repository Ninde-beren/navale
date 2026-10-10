import type { DatabaseSync } from 'node:sqlite';

/**
 * Ce que le journal ne dit pas sur la façon de jouer, noté une fois par partie :
 * - `shared_board` : l'écran central a partagé son lien (bouton de partage du lobby) ;
 * - `shared_phone` : un téléphone a invité des amis à distance ;
 * - `remote_board` : l'écran de la partie s'est ouvert sur un autre appareil que celui de l'hôte.
 */
export type GameMark = 'shared_board' | 'shared_phone' | 'remote_board';

/**
 * Marques d'usage, pour les statistiques de l'administration : anonymes, sans adresse
 * ni identifiant de personne, une ligne au plus par partie et par marque. Hors du
 * journal, qui ne porte que les règles du jeu.
 */
export class UsageMarks {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_marks (
        game_id TEXT NOT NULL,
        mark TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (game_id, mark)
      );
      CREATE TABLE IF NOT EXISTS usage_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // Les parties d'avant la mesure n'ont aucune marque : les pourcentages partent d'ici.
    db.prepare("INSERT OR IGNORE INTO usage_meta (key, value) VALUES ('marks_since', ?)").run(
      String(Date.now()),
    );
  }

  /** Note la marque ; la première fois seulement, les suivantes ne changent rien. */
  mark(gameId: string, mark: GameMark, at: number): void {
    this.db
      .prepare('INSERT OR IGNORE INTO game_marks (game_id, mark, at) VALUES (?, ?, ?)')
      .run(gameId, mark, at);
  }

  /** Les marques de chaque partie qui en a. */
  all(): Map<string, Set<GameMark>> {
    const out = new Map<string, Set<GameMark>>();
    const rows = this.db.prepare('SELECT game_id, mark FROM game_marks').all() as Array<{
      game_id: string;
      mark: GameMark;
    }>;
    for (const { game_id, mark } of rows) {
      const set = out.get(game_id) ?? new Set<GameMark>();
      set.add(mark);
      out.set(game_id, set);
    }
    return out;
  }

  /** Début de la mesure : la première ouverture de la base avec cette table. */
  since(): number {
    const row = this.db.prepare("SELECT value FROM usage_meta WHERE key = 'marks_since'").get() as
      { value: string } | undefined;
    return Number(row?.value ?? Date.now());
  }
}
