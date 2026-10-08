import { join } from 'node:path';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { Variant } from '@navale/protocol';
import type { ServerConfig } from './config.js';
import { registerFeedback } from './http/feedback.js';
import { registerGameRoutes } from './http/games.js';
import { registerStatic } from './http/static.js';
import { mailerFromConfig, type Mailer } from './mail/mailer.js';
import { registerSockets } from './realtime/handlers.js';
import { PresenceTracker } from './realtime/presence.js';
import { BotDriver } from './runtime/bots.js';
import { Publisher } from './runtime/publisher.js';
import { RematchService } from './runtime/rematch.js';
import { DEFAULT_EXPIRY, Sweeper, type ExpiryPolicy } from './runtime/sweeper.js';
import { RoundTimers } from './runtime/timers.js';
import { EventStore } from './store/event-store.js';
import { GameRegistry } from './store/registry.js';

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
  const store = EventStore.open(storePath);
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
  });
  // Navale ne s'indexe pas : chaque réponse le dit aux moteurs, en plus de la balise
  // `robots` de la page. `robots.txt` laisse explorer, sinon le noindex ne serait jamais
  // lu et les aperçus de lien (Open Graph) ne s'afficheraient plus.
  app.addHook('onRequest', async (_request, reply) => {
    void reply.header('x-robots-tag', 'noindex, nofollow');
  });
  const io = new Server(app.server, { serveClient: false });
  const presence = new PresenceTracker(io);
  const publisher = new Publisher(io, presence);
  const bots = new BotDriver(options.botThinkMs, (msg) => app.log.warn(msg));
  const timers = new RoundTimers();
  const registry: GameRegistry = new GameRegistry(store, {
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

  registerGameRoutes(app, registry, config);
  registerFeedback(app, { store, mailer, version }, config);
  registerSockets(io, registry, publisher, presence);
  if (config.webDist) await registerStatic(app, config.webDist, config.publicUrl);

  return {
    app,
    io,
    registry,
    store,
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
      store.close();
    },
  };
}
