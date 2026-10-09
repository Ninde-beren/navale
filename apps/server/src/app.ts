import { join } from 'node:path';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { Variant } from '@navale/protocol';
import type { ServerConfig } from './config.js';
import { registerAdmin } from './http/admin.js';
import { registerFeedback } from './http/feedback.js';
import { registerGameRoutes } from './http/games.js';
import { registerRateLimit } from './http/rate-limit.js';
import { registerStatic } from './http/static.js';
import { mailerFromConfig, type Mailer } from './mail/mailer.js';
import { registerSockets } from './realtime/handlers.js';
import { PresenceTracker } from './realtime/presence.js';
import type { GameServer } from './realtime/types.js';
import { BotDriver } from './runtime/bots.js';
import { Publisher } from './runtime/publisher.js';
import { RematchService } from './runtime/rematch.js';
import { DEFAULT_EXPIRY, Sweeper, type ExpiryPolicy } from './runtime/sweeper.js';
import { RoundTimers } from './runtime/timers.js';
import { openDatabase } from './store/database.js';
import { EventStore } from './store/event-store.js';
import { FeedbackStore } from './store/feedback-store.js';
import { GameHistory } from './store/history.js';
import { GameRegistry } from './store/registry.js';
import { TokenStore } from './store/token-store.js';

export interface AppOptions {
  /** Délai de réflexion des bots selon la variante, injectable pour les tests. */
  botThinkMs?: (variant: Variant) => number;
  /** Politique d'expiration des parties. */
  expiry?: ExpiryPolicy;
  /** Envoi des retours par mail ; par défaut SMTP d'après la configuration, `null` sans SMTP. */
  mailer?: Mailer | null;
}

export async function createApp(
  config: ServerConfig,
  storePath = join(config.dataDir, 'navale.sqlite'),
  options: AppOptions = {},
) {
  const db = openDatabase(storePath);
  const store = new EventStore(db);
  const tokens = new TokenStore(db);
  const feedback = new FeedbackStore(db);
  const history = new GameHistory(db);
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    // Derrière Caddy (réseau Docker privé) ou le proxy de Vite (boucle locale), l'adresse
    // du joueur se lit dans X-Forwarded-For. Sans ça, toutes les requêtes viendraient du
    // proxy et partageraient la même limite de débit. Un client qui joint le serveur
    // directement depuis Internet n'est pas cru sur parole.
    trustProxy: ['loopback', 'uniquelocal'],
  });
  // Navale ne s'indexe pas : chaque réponse le dit aux moteurs, en plus de la balise
  // `robots` de la page. `robots.txt` laisse explorer, sinon le noindex ne serait jamais
  // lu et les aperçus de lien (Open Graph) ne s'afficheraient plus.
  app.addHook('onRequest', async (_request, reply) => {
    void reply.header('x-robots-tag', 'noindex, nofollow');
  });
  const io: GameServer = new Server(app.server, { serveClient: false });
  const presence = new PresenceTracker(io);
  const publisher = new Publisher(io, presence);
  const bots = new BotDriver({
    settledAt: (gameId) => publisher.settledAt(gameId),
    ...(options.botThinkMs ? { thinkMs: options.botThinkMs } : {}),
    log: (message) => app.log.warn(message),
  });
  const timers = new RoundTimers();
  const registry: GameRegistry = new GameRegistry(store, tokens, {
    onEvents: (runtime, envelopes) => {
      registry.sync(runtime);
      publisher.publish(runtime, envelopes);
      bots.onEvents(runtime, envelopes);
      timers.reschedule(runtime);
      rematch.onEvents(runtime, envelopes);
    },
  });
  const rematch = new RematchService(io, registry, publisher, presence);
  const restored = registry.restore();
  for (const runtime of registry.all()) {
    bots.resume(runtime);
    timers.reschedule(runtime);
  }
  const sweeper = new Sweeper(registry, options.expiry ?? DEFAULT_EXPIRY, (msg) =>
    app.log.info(msg),
  );
  sweeper.start();

  const version = process.env.NAVALE_VERSION ?? 'dev';
  const mailer = options.mailer === undefined ? mailerFromConfig(config) : options.mailer;
  if (mailer) {
    void mailer.verify().then(
      () => app.log.info(`retours envoyés par mail à ${mailer.to} (${mailer.describe})`),
      (err: unknown) =>
        app.log.warn(
          { err },
          `${mailer.describe} : envoi impossible, les retours resteront en base`,
        ),
    );
  }

  await registerRateLimit(app);
  registerGameRoutes(app, registry, config);
  registerFeedback(app, { store: feedback, mailer, version }, config);
  registerAdmin(app, { registry, presence, io, history, feedback, mailer }, config);
  registerSockets(io, registry, publisher, presence);
  if (config.webDist) await registerStatic(app, config.webDist, config.publicUrl);

  return {
    app,
    io,
    registry,
    store,
    feedback,
    config,
    restored,
    sweeper,
    async listen(): Promise<string> {
      return app.listen({ port: config.port, host: '0.0.0.0' });
    },
    async close(): Promise<void> {
      sweeper.close();
      timers.close();
      bots.close();
      publisher.close();
      io.close();
      await app.close();
      db.close();
    },
  };
}
