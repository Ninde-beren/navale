import type { FastifyInstance, FastifyReply } from 'fastify';
import QRCode from 'qrcode';
import { HostLinkRequestSchema, normalizeGameCode, type HostLink } from '@navale/protocol';
import type { ServerConfig } from '../config.js';
import type { GameRuntime } from '../runtime/game-runtime.js';
import type { GameRegistry } from '../store/registry.js';
import type { UsageMarks } from '../store/usage-marks.js';

/** Assez pour montrer le lien plusieurs fois dans une soirée, pas pour essayer des jetons par script. */
export const HOST_LINK_LIMIT = { max: 20, timeWindow: '10 minutes' };

/**
 * Le lien d'hôte : l'écran central de la partie, jeton de l'hôte après `#`. Le navigateur
 * ne met jamais ce qui suit `#` dans une requête : le jeton ne finit dans aucun journal d'accès.
 */
export function hostLinkUrl(publicUrl: string, code: string, hostToken: string): string {
  return `${publicUrl}/host/${code}#${hostToken}`;
}

/**
 * Changer d'appareil hôte. `POST /api/games/:code/host-link` donne à l'hôte son lien et
 * son QR ; `POST /api/games/:code/host-link/opened` dit que le lien s'est ouvert sur un
 * autre appareil. Les deux notent la partie, une fois, pour les statistiques.
 */
export function registerHostLinkRoutes(
  app: FastifyInstance,
  registry: GameRegistry,
  marks: UsageMarks,
  config: ServerConfig,
): void {
  /** La partie de ce code dont le jeton reçu est celui de l'hôte. */
  const hosted = (
    code: string,
    body: unknown,
    reply: FastifyReply,
  ): { runtime: GameRuntime; hostToken: string } | FastifyReply => {
    const parsed = HostLinkRequestSchema.safeParse(body);
    if (!parsed.success)
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Jeton d’hôte manquant.' });
    const rec = registry.resolveToken(parsed.data.hostToken);
    const runtime = rec?.role === 'host' ? registry.get(rec.gameId) : undefined;
    if (!runtime || runtime.code !== normalizeGameCode(code))
      return reply.code(403).send({
        code: 'TOKEN_INVALID',
        message: 'Ce lien d’hôte ne vaut plus : la partie est terminée ou a expiré.',
      });
    return { runtime, hostToken: parsed.data.hostToken };
  };

  app.post<{ Params: { code: string } }>(
    '/api/games/:code/host-link',
    { config: { rateLimit: HOST_LINK_LIMIT } },
    async (request, reply) => {
      const host = hosted(request.params.code, request.body, reply);
      if (!('runtime' in host)) return host;
      const url = hostLinkUrl(config.publicUrl, host.runtime.code, host.hostToken);
      const qr = await QRCode.toString(url, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0A0E1A', light: '#FFFFFF' },
      });
      marks.mark(host.runtime.gameId, 'host_link', Date.now());
      const link: HostLink = { url, qr };
      return reply.header('cache-control', 'no-store').send(link);
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/games/:code/host-link/opened',
    { config: { rateLimit: HOST_LINK_LIMIT } },
    async (request, reply) => {
      const host = hosted(request.params.code, request.body, reply);
      if (!('runtime' in host)) return host;
      marks.mark(host.runtime.gameId, 'host_moved', Date.now());
      return reply.code(204).send();
    },
  );
}
