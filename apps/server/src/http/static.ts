import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * Repère que `index.html` porte là où il faut l'adresse publique : les aperçus de
 * lien (Open Graph) n'acceptent qu'une URL d'image absolue. Le serveur le remplace
 * par `PUBLIC_URL` au démarrage, la même image se déploie donc sur n'importe quel domaine.
 */
export const PUBLIC_URL_MARK = '__PUBLIC_URL__';

/**
 * Production : le serveur sert le build web, une seule origine et un seul port
 * (E0-S4). Les fichiers hachés de `assets/` sont immuables ; `index.html`, le
 * service worker et le manifeste se revalident à chaque chargement, sinon une
 * mise à jour ne serait jamais vue. Toute route inconnue hors API et temps réel
 * renvoie l'application : le routage se fait côté client.
 */
export async function registerStatic(
  app: FastifyInstance,
  dir: string,
  publicUrl: string,
): Promise<void> {
  const indexHtml = readFileSync(join(dir, 'index.html'), 'utf8').replaceAll(
    PUBLIC_URL_MARK,
    publicUrl,
  );
  const sendApp = (reply: FastifyReply) =>
    reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(indexHtml);

  await app.register(fastifyStatic, {
    root: dir,
    // `index.html` passe par `sendApp`, jamais tel qu'il est sur le disque.
    index: false,
    setHeaders: (reply, path) => {
      void reply.header(
        'cache-control',
        /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.get('/', (_request, reply) => sendApp(reply));
  app.get('/index.html', (_request, reply) => sendApp(reply));
  app.setNotFoundHandler((request, reply) => {
    const isApp =
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/socket.io/');
    if (isApp) return sendApp(reply);
    return reply.code(404).send({ code: 'NOT_FOUND', message: 'Route inconnue.' });
  });
}
