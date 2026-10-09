import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { historyStats, liveStats } from '../admin/stats.js';
import { renderAdminPage } from '../admin/page.js';
import type { ServerConfig } from '../config.js';
import type { Mailer } from '../mail/mailer.js';
import type { PresenceTracker } from '../realtime/presence.js';
import type { GameServer } from '../realtime/types.js';
import type { FeedbackStore } from '../store/feedback-store.js';
import type { GameHistory } from '../store/history.js';
import type { GameRegistry } from '../store/registry.js';

export interface AdminDeps {
  registry: GameRegistry;
  presence: PresenceTracker;
  io: GameServer;
  history: GameHistory;
  feedback: FeedbackStore;
  /** Pour dire où partent les retours ; `null` tant que SMTP n'est pas configuré. */
  mailer: Mailer | null;
}

/** Nombre de retours affichés, les plus récents. */
const FEEDBACK_SHOWN = 50;

/** Identifiant et mot de passe d'un en-tête `Authorization: Basic …`. */
export function basicCredentials(header: string | undefined): [string, string] | null {
  const encoded = /^Basic\s+(\S+)$/i.exec(header ?? '')?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  return sep < 0 ? null : [decoded.slice(0, sep), decoded.slice(sep + 1)];
}

/** Comparaison en temps constant, quelle que soit la longueur saisie. */
function same(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Espace d'administration `/admin` : parties ouvertes, joueurs connectés,
 * historique des parties jouées et retours du bouton « Un avis ? ». Protégé par HTTP Basic Auth (`ADMIN_USER`,
 * `ADMIN_PASSWORD`) ; fermé tant qu'aucun mot de passe n'est défini.
 */
export function registerAdmin(app: FastifyInstance, deps: AdminDeps, config: ServerConfig): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    void reply.header('cache-control', 'no-store');
    if (!config.adminPassword) {
      return reply
        .code(503)
        .type('text/plain; charset=utf-8')
        .send('Administration fermée : définir ADMIN_PASSWORD sur le serveur.');
    }
    const given = basicCredentials(request.headers.authorization);
    const userOk = same(given?.[0] ?? '', config.adminUser ?? 'admin');
    const passwordOk = same(given?.[1] ?? '', config.adminPassword);
    if (!given || !userOk || !passwordOk) {
      return reply
        .code(401)
        .header('www-authenticate', 'Basic realm="Navale admin", charset="UTF-8"')
        .type('text/plain; charset=utf-8')
        .send('Identifiants requis.');
    }
    const now = Date.now();
    const html = renderAdminPage({
      live: liveStats(deps.registry, deps.presence, deps.io),
      history: historyStats(deps.history, now),
      feedback: deps.feedback.recent(FEEDBACK_SHOWN),
      feedbackTotal: deps.feedback.count(),
      mailTo: deps.mailer?.to ?? null,
      now,
      version: process.env.NAVALE_VERSION ?? 'dev',
    });
    return reply
      .header(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      )
      .header('referrer-policy', 'no-referrer')
      .type('text/html; charset=utf-8')
      .send(html);
  };
  app.get('/admin', handler);
  app.get('/admin/', handler);
}
