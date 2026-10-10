import type { EventStore } from '../store/event-store.js';
import type { ReportFailure } from './failure.js';

/** Une ronde par heure suffit : une partie compactée une heure plus tard ne change rien. */
export const COMPACTION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Compactage des journaux : au démarrage puis toutes les heures, une partie terminée ou
 * annulée depuis plus de `keepMs` (24 h) perd ses coups. Le replay ne la sert déjà plus, et
 * le serveur ne grossit plus que de quelques lignes par partie. Chaque partie à part : une
 * panne dans l'une n'empêche pas de compacter les autres.
 */
export class JournalCompactor {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: EventStore,
    private readonly keepMs: number,
    private readonly log: (msg: string) => void = () => undefined,
    private readonly report: ReportFailure = () => undefined,
    private readonly intervalMs: number = COMPACTION_INTERVAL_MS,
  ) {}

  start(): void {
    this.run();
    if (this.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => this.run(), this.intervalMs);
    this.timer.unref();
  }

  /** Une ronde : les parties compactées. */
  run(now: number = Date.now()): string[] {
    const done: string[] = [];
    let ids: string[] = [];
    try {
      ids = this.store.compactable(now - this.keepMs);
    } catch (err) {
      this.report(err, { gameId: '-', during: 'recherche des journaux à compacter' });
    }
    for (const gameId of ids) {
      try {
        this.store.compact(gameId);
        done.push(gameId);
      } catch (err) {
        this.report(err, { gameId, during: 'compactage du journal' });
      }
    }
    if (done.length > 0) this.log(`${done.length} journal(aux) compacté(s)`);
    return done;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
