import type { FastifyInstance } from 'fastify';
import type { Replay } from '@navale/protocol';
import type { EventStore } from '../store/event-store.js';

/** Assez pour revoir quelques parties de suite, pas pour aspirer le journal par script. */
export const REPLAY_LIMIT = { max: 30, timeWindow: '10 minutes' };

/**
 * `GET /api/games/:gameId/replay` : le journal d'une partie terminée, pour le lecteur de
 * replay, pendant `keepMs` après sa fin (24 h, comme une partie terminée reste en mémoire) ;
 * au-delà, seul un fichier exporté la garde. Une partie en cours, annulée ou inconnue n'en a
 * pas : son journal garde des secrets qui comptent encore. Par l'identifiant de la partie,
 * pas par son code : une revanche reprend le même code.
 */
export function registerReplayRoutes(
  app: FastifyInstance,
  store: EventStore,
  keepMs: number,
  now: () => number = Date.now,
): void {
  app.get<{ Params: { gameId: string } }>(
    '/api/games/:gameId/replay',
    { config: { rateLimit: REPLAY_LIMIT } },
    async (request, reply) => {
      const { gameId } = request.params;
      const game = store.game(gameId);
      if (!game || game.status !== 'FINISHED')
        return reply
          .code(404)
          .send({ code: 'GAME_NOT_FINISHED', message: 'Pas de partie terminée à revoir ici.' });
      const expiresAt = game.updatedAt + keepMs;
      if (now() > expiresAt)
        return reply.code(410).send({
          code: 'REPLAY_EXPIRED',
          message:
            'Ce replay a expiré : une partie se revoit pendant 24 h après sa fin. Un fichier exporté, lui, se rouvre ici.',
        });
      const replay: Replay = { gameId, code: game.code, events: store.events(gameId), expiresAt };
      return replay;
    },
  );
}
