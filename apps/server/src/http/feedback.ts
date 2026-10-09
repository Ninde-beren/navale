import type { FastifyInstance } from 'fastify';
import { FeedbackSchema } from '@navale/protocol';
import type { ServerConfig } from '../config.js';
import type { Mail, Mailer } from '../mail/mailer.js';
import type { FeedbackRecord, FeedbackStore } from '../store/feedback-store.js';
import { sendTooManyRequests } from './rate-limit.js';

export interface FeedbackDeps {
  store: FeedbackStore;
  mailer: Mailer | null;
  version: string;
}

/** Par adresse : de quoi corriger un message envoyé trop vite, pas de quoi tourner en boucle. */
export const FEEDBACK_LIMIT = { max: 5, timeWindow: '10 minutes' };

/** Toutes adresses confondues : contre un robot qui en changerait à chaque envoi. */
export const FEEDBACK_TOTAL_LIMIT = { max: 60, timeWindow: '1 hour' };

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
 * d'abord enregistré en base (rien ne se perd, l'administration le liste), puis le
 * mail part en tâche de fond quand SMTP est configuré. Deux garde-fous contre les
 * boucles et les robots : `FEEDBACK_LIMIT` par adresse, `FEEDBACK_TOTAL_LIMIT` au total.
 */
export function registerFeedback(
  app: FastifyInstance,
  deps: FeedbackDeps,
  config: ServerConfig,
): void {
  const checkTotal = app.createRateLimit({ ...FEEDBACK_TOTAL_LIMIT, keyGenerator: () => 'all' });

  const deliver = async (record: FeedbackRecord): Promise<void> => {
    if (!deps.mailer) return;
    try {
      await deps.mailer.send(feedbackMail(record, config.publicUrl));
      deps.store.markSent(record.id, Date.now());
      app.log.info(`retour nº ${record.id} envoyé à ${deps.mailer.to}`);
    } catch (err) {
      app.log.error({ err }, `retour nº ${record.id} enregistré mais mail non envoyé`);
    }
  };

  app.post('/api/feedback', { config: { rateLimit: FEEDBACK_LIMIT } }, async (request, reply) => {
    const total = await checkTotal(request);
    if (!total.isAllowed && total.isExceeded) return sendTooManyRequests(reply, total.ttl);
    const now = Date.now();
    const parsed = FeedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'BAD_REQUEST',
        message: 'Message invalide : trois caractères au moins, deux mille au plus.',
        details: parsed.error.issues,
      });
    }
    const { message, email, context } = parsed.data;
    const record = deps.store.save({
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
