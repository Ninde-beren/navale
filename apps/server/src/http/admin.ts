import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { historyStats, liveStats } from '../admin/stats.js';
import { renderAdminPage } from '../admin/page.js';
import { observerCookieHeader } from '../admin/tracking.js';
import { PERIODS, renderUsagePage, type PeriodId } from '../admin/usage-page.js';
import { usageStats } from '../admin/usage.js';
import type { ServerConfig } from '../config.js';
import type { Mailer } from '../mail/mailer.js';
import type { PresenceTracker } from '../realtime/presence.js';
import type { GameServer } from '../realtime/types.js';
import type { FeedbackStore } from '../store/feedback-store.js';
import type { GameHistory } from '../store/history.js';
import type { GameRegistry } from '../store/registry.js';
import type { UsageMarks } from '../store/usage-marks.js';

export interface AdminDeps {
  registry: GameRegistry;
  presence: PresenceTracker;
  io: GameServer;
  history: GameHistory;
  feedback: FeedbackStore;
  marks: UsageMarks;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Espace d'administration, protégé par HTTP Basic Auth (`ADMIN_USER`, `ADMIN_PASSWORD`)
 * et fermé tant qu'aucun mot de passe n'est défini :
 * - `/admin` : parties ouvertes, joueurs connectés, historique des parties jouées et
 *   retours du bouton « Un avis ? » ;
 * - `/admin/statistiques` : configurations, commandants, sessions, durées, humains et
 *   bots, jeu sur place ou à distance.
 */
export function registerAdmin(app: FastifyInstance, deps: AdminDeps, config: ServerConfig): void {
  /** Refuse la requête si elle n'est pas de l'exploitant ; renvoie alors la réponse envoyée. */
  const refuse = (authorization: string | undefined, reply: FastifyReply) => {
    void reply.header('cache-control', 'no-store');
    if (!config.adminPassword) {
      return reply
        .code(503)
        .type('text/plain; charset=utf-8')
        .send('Administration fermée : définir ADMIN_PASSWORD sur le serveur.');
    }
    const given = basicCredentials(authorization);
    const userOk = same(given?.[0] ?? '', config.adminUser ?? 'admin');
    const passwordOk = same(given?.[1] ?? '', config.adminPassword);
    if (!given || !userOk || !passwordOk) {
      return reply
        .code(401)
        .header('www-authenticate', 'Basic realm="Navale admin", charset="UTF-8"')
        .type('text/plain; charset=utf-8')
        .send('Identifiants requis.');
    }
    return null;
  };
  const sendPage = (reply: FastifyReply, html: string) =>
    reply
      .header(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      )
      .header('referrer-policy', 'no-referrer')
      .header('set-cookie', observerCookieHeader)
      .type('text/html; charset=utf-8')
      .send(html);

  const live = async (request: FastifyRequest, reply: FastifyReply) => {
    const refused = refuse(request.headers.authorization, reply);
    if (refused) return refused;
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
    return sendPage(reply, html);
  };

  const stats = async (
    request: FastifyRequest<{ Querystring: { periode?: string } }>,
    reply: FastifyReply,
  ) => {
    const refused = refuse(request.headers.authorization, reply);
    if (refused) return refused;
    const now = Date.now();
    const period = PERIODS.find((p) => p.id === request.query.periode) ?? PERIODS[0];
    const html = renderUsagePage({
      stats: usageStats({
        played: deps.history.playedGames(),
        marks: deps.marks.all(),
        marksSince: deps.marks.since(),
        since: period.days === null ? null : now - period.days * DAY_MS,
      }),
      period: period.id satisfies PeriodId,
      now,
      version: process.env.NAVALE_VERSION ?? 'dev',
    });
    return sendPage(reply, html);
  };

  app.get('/admin', live);
  app.get('/admin/', live);
  app.get<{ Querystring: { periode?: string } }>('/admin/statistiques', stats);
}
