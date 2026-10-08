import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Production : le serveur sert le build web, une seule origine et un seul port
 * (E0-S4). Les fichiers hachés de `assets/` sont immuables ; `index.html`, le
 * service worker et le manifeste se revalident à chaque chargement, sinon une
 * mise à jour ne serait jamais vue. Toute route inconnue hors API et temps réel
 * renvoie l'application : le routage se fait côté client.
 */
export async function registerStatic(app: FastifyInstance, dir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: dir,
    setHeaders: (reply, path) => {
      void reply.header(
        'cache-control',
        /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.setNotFoundHandler((request, reply) => {
    const isApp =
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/socket.io/');
    if (isApp) return reply.sendFile('index.html');
    return reply.code(404).send({ code: 'NOT_FOUND', message: 'Route inconnue.' });
  });
}
