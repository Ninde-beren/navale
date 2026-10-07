import { join } from 'node:path';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import { registerGameRoutes } from './http/games.js';
import { registerSockets } from './realtime/handlers.js';
import { PresenceTracker } from './realtime/presence.js';
import { Publisher } from './runtime/publisher.js';
import { EventStore } from './store/event-store.js';
import { GameRegistry } from './store/registry.js';

export async function createApp(
  config: ServerConfig,
  storePath = join(config.dataDir, 'navale.sqlite'),
) {
  const store = EventStore.open(storePath);
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
  });
  const io = new Server(app.server, { serveClient: false });
  const presence = new PresenceTracker(io);
  const publisher = new Publisher(io, presence);
  const registry: GameRegistry = new GameRegistry(store, {
    onEvents: (runtime, envelopes) => {
      registry.sync(runtime);
      publisher.publish(runtime, envelopes);
    },
  });
  const restored = registry.restore();

  registerGameRoutes(app, registry, config);
  registerSockets(io, registry, publisher, presence);

  return {
    app,
    io,
    registry,
    store,
    config,
    restored,
    async listen(): Promise<string> {
      return app.listen({ port: config.port, host: '0.0.0.0' });
    },
    async close(): Promise<void> {
      publisher.close();
      io.close();
      await app.close();
      store.close();
    },
  };
}
