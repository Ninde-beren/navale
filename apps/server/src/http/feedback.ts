import type { FastifyInstance, FastifyRequest } from 'fastify';
import { FeedbackSchema } from '@navale/protocol';
import type { ServerConfig } from '../config.js';
import type { Mail, Mailer } from '../mail/mailer.js';
import type { EventStore, FeedbackRecord } from '../store/event-store.js';

export interface FeedbackDeps {
  store: EventStore;
  mailer: Mailer | null;
  version: string;
}

/** Compteur glissant : au plus `limit` passages par clé sur `windowMs`. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/**
 * Adresse du client telle que le reverse proxy la voit : la dernière de
 * `X-Forwarded-For`, celle que Caddy ajoute lui-même. Les précédentes viennent du
 * client et ne valent rien ; sans en-tête, l'adresse de la connexion.
 */
export function clientAddress(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
  const last = header?.split(',').at(-1)?.trim();
  return last || request.ip;
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'full',
  timeStyle: 'short',
});

/** Le mail envoyé à l'exploitant pour un retour : le message, puis le contexte, ligne par ligne. */
export function feedbackMail(record: FeedbackRecord, publicUrl: string): Mail {
  const where = record.code ? `${record.path} · partie ${record.code}` : record.path;
  const lines = [
    record.message,
    '',
    '—',
    `Reçu le ${dateTime.format(record.at)}`,
    `Page : ${publicUrl}${record.path}`,
    ...(record.code ? [`Partie : ${record.code}`] : []),
    ...(record.email ? [`De : ${record.email}`] : ['De : anonyme (pas d’adresse laissée)']),
    ...(record.screen ? [`Écran : ${record.screen}`] : []),
    ...(record.userAgent ? [`Navigateur : ${record.userAgent}`] : []),
    `Version : ${record.version ?? 'dev'} · retour nº ${record.id}`,
  ];
  return {
    subject: `Navale · retour depuis ${where}`,
    text: lines.join('\n'),
    ...(record.email ? { replyTo: record.email } : {}),
  };
}

/**
 * `POST /api/feedback` : le bouton « Un avis ? » de toutes les pages. Le retour est
 * d'abord enregistré en base (rien ne se perd), puis le
 * mail part en tâche de fond quand SMTP est configuré. Deux garde-fous : par
 * adresse (5 en 10 min) et global (60 par heure), contre les boucles et les robots.
 */
export function registerFeedback(
  app: FastifyInstance,
  deps: FeedbackDeps,
  config: ServerConfig,
): void {
  const perAddress = new RateLimiter(5, 10 * 60_000);
  const overall = new RateLimiter(60, 60 * 60_000);

  const deliver = async (record: FeedbackRecord): Promise<void> => {
    if (!deps.mailer) return;
    try {
      await deps.mailer.send(feedbackMail(record, config.publicUrl));
      deps.store.markFeedbackSent(record.id, Date.now());
      app.log.info(`retour nº ${record.id} envoyé à ${deps.mailer.to}`);
    } catch (err) {
      app.log.error({ err }, `retour nº ${record.id} enregistré mais mail non envoyé`);
    }
  };

  app.post('/api/feedback', async (request, reply) => {
    const now = Date.now();
    if (!perAddress.allow(clientAddress(request), now) || !overall.allow('*', now)) {
      return reply.code(429).send({
        code: 'TOO_MANY_REQUESTS',
        message: 'Trop de messages d’un coup : réessaie dans quelques minutes.',
      });
    }
    const parsed = FeedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'BAD_REQUEST',
        message: 'Message invalide : trois caractères au moins, deux mille au plus.',
        details: parsed.error.issues,
      });
    }
    const { message, email, context } = parsed.data;
    const record = deps.store.saveFeedback({
      at: now,
      message,
      email: email || null,
      path: context.path,
      code: context.code ?? null,
      screen: context.screen ?? null,
      userAgent: (request.headers['user-agent'] ?? '').slice(0, 300) || null,
      version: deps.version,
    });
    // Réponse tout de suite : le retour est au chaud en base, le mail suit.
    void deliver(record);
    return reply.code(202).send({ ok: true, id: record.id, mail: deps.mailer ? 'queued' : 'off' });
  });
}
