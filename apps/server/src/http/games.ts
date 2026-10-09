import type { FastifyInstance, FastifyReply } from 'fastify';
import QRCode from 'qrcode';
import { makeSettings, validateSettings } from '@navale/engine';
import {
  CreateGameRequestSchema,
  GameSettingsSchema,
  type CreateGameResponse,
  type GameInfo,
} from '@navale/protocol';
import type { ServerConfig } from '../config.js';
import type { GameRegistry } from '../store/registry.js';

/**
 * Parties créées par adresse IP : assez pour enchaîner les parties d'une soirée, même
 * avec plusieurs tables sur le même Wi-Fi, mais pas pour remplir le journal par script.
 */
export const GAME_CREATION_LIMIT = { max: 30, timeWindow: '1 hour' };

function badRequest(reply: FastifyReply, message: string, details: unknown) {
  return reply.code(400).send({ code: 'BAD_REQUEST', message, details });
}

function unknownCode(reply: FastifyReply) {
  return reply.code(404).send({ code: 'CODE_UNKNOWN', message: 'Aucune partie avec ce code.' });
}

export function registerGameRoutes(
  app: FastifyInstance,
  registry: GameRegistry,
  config: ServerConfig,
): void {
  app.get('/api/health', async () => ({
    ok: true,
    games: registry.all().length,
    uptime: Math.round(process.uptime()),
    version: process.env.NAVALE_VERSION ?? 'dev',
  }));

  app.post('/api/games', { config: { rateLimit: GAME_CREATION_LIMIT } }, async (request, reply) => {
    const parsed = CreateGameRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'Paramètres invalides.', parsed.error.issues);
    // Le preset complète les réglages choisis ; le résultat doit encore respecter le schéma…
    const settings = GameSettingsSchema.safeParse(
      makeSettings(parsed.data.settings, parsed.data.preset),
    );
    if (!settings.success) return badRequest(reply, 'Paramètres invalides.', settings.error.issues);
    // …et les règles qui lient les champs entre eux (flotte qui tient dans la grille…).
    const incoherent = validateSettings(settings.data);
    if (incoherent.length > 0) return badRequest(reply, 'Paramètres incohérents.', incoherent);

    const { runtime, hostToken } = registry.create(settings.data);
    const created: CreateGameResponse = {
      gameId: runtime.gameId,
      code: runtime.code,
      hostToken,
      boardUrl: `${config.publicUrl}/board/${runtime.code}`,
      joinUrl: `${config.publicUrl}/play/${runtime.code}`,
    };
    return reply.code(201).send(created);
  });

  app.get<{ Params: { code: string } }>('/api/games/:code', async (request, reply) => {
    const runtime = registry.findByCode(request.params.code);
    if (!runtime) return unknownCode(reply);
    const { state } = runtime;
    const info: GameInfo = {
      gameId: state.gameId,
      code: state.code,
      status: state.status,
      players: state.players.length,
      maxPlayers: state.settings.maxPlayers,
      joinable: state.status === 'LOBBY' && state.players.length < state.settings.maxPlayers,
      takenColors: state.players.map((p) => p.color),
      takenNames: state.players.map((p) => p.name),
    };
    return info;
  });

  app.get<{ Params: { code: string } }>('/api/games/:code/qr.svg', async (request, reply) => {
    const runtime = registry.findByCode(request.params.code);
    if (!runtime) return unknownCode(reply);
    const svg = await QRCode.toString(`${config.publicUrl}/play/${runtime.code}`, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0A0E1A', light: '#FFFFFF' },
    });
    return reply
      .header('content-type', 'image/svg+xml')
      .header('cache-control', 'no-store')
      .send(svg);
  });
}
