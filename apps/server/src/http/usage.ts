import type { FastifyInstance } from 'fastify';
import { GameSharedRequestSchema } from '@navale/protocol';
import type { GameRegistry } from '../store/registry.js';
import type { UsageMarks } from '../store/usage-marks.js';

/** Assez pour quelques partages par partie, pas pour remplir la table par script. */
export const SHARE_LIMIT = { max: 20, timeWindow: '10 minutes' };

/**
 * `POST /api/games/:code/shared` : le bouton de partage a servi. La partie est notée
 * une fois, anonymement, pour les statistiques de l'administration.
 */
export function registerUsageRoutes(
  app: FastifyInstance,
  registry: GameRegistry,
  marks: UsageMarks,
): void {
  app.post<{ Params: { code: string } }>(
    '/api/games/:code/shared',
    { config: { rateLimit: SHARE_LIMIT } },
    async (request, reply) => {
      const body = GameSharedRequestSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Partage mal décrit.' });
      const runtime = registry.findByCode(request.params.code);
      if (!runtime)
        return reply
          .code(404)
          .send({ code: 'CODE_UNKNOWN', message: 'Aucune partie avec ce code.' });
      marks.mark(
        runtime.gameId,
        body.data.from === 'board' ? 'shared_board' : 'shared_phone',
        Date.now(),
      );
      return reply.code(204).send();
    },
  );
}
