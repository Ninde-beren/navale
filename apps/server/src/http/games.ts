import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { makeSettings, validateSettings } from '@navale/engine';
import {
  EndConditionSchema,
  GameSettingsSchema,
  PresetIdSchema,
  ShipSpecSchema,
  SunkRevealSchema,
  VariantSchema,
} from '@navale/protocol';
import type { ServerConfig } from '../config.js';
import { isValidCode, normalizeCode } from '../runtime/codes.js';
import type { GameRegistry } from '../store/registry.js';

export const CreateGameRequestSchema = z.object({
  settings: z.object({
    variant: VariantSchema,
    maxPlayers: z.number().int().min(2).max(4),
    endCondition: EndConditionSchema.optional(),
    sunkReveal: SunkRevealSchema.optional(),
    grid: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
    fleet: z.array(ShipSpecSchema).optional(),
    shipsMayTouch: z.boolean().optional(),
    roundTimerSeconds: z.number().int().nullable().optional(),
    revealDelayMs: z.number().int().optional(),
  }),
  preset: PresetIdSchema.optional(),
});

function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function registerGameRoutes(
  app: FastifyInstance,
  registry: GameRegistry,
  config: ServerConfig,
): void {
  app.get('/api/health', async () => ({ ok: true, games: registry.all().length }));

  app.post('/api/games', async (request, reply) => {
    const parsed = CreateGameRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'BAD_REQUEST',
        message: 'Paramètres invalides.',
        details: parsed.error.issues,
      });
    }
    const { settings: input, preset } = parsed.data;
    const built = GameSettingsSchema.safeParse(
      makeSettings(
        { ...compact(input), variant: input.variant, maxPlayers: input.maxPlayers },
        preset,
      ),
    );
    if (!built.success) {
      return reply.code(400).send({
        code: 'BAD_REQUEST',
        message: 'Paramètres invalides.',
        details: built.error.issues,
      });
    }
    const errors = validateSettings(built.data);
    if (errors.length > 0) {
      return reply
        .code(400)
        .send({ code: 'BAD_REQUEST', message: 'Paramètres incohérents.', details: errors });
    }
    const { runtime, hostToken } = registry.create(built.data);
    return reply.code(201).send({
      gameId: runtime.gameId,
      code: runtime.code,
      hostToken,
      boardUrl: `${config.publicUrl}/board/${runtime.code}`,
      joinUrl: `${config.publicUrl}/play/${runtime.code}`,
    });
  });

  app.get<{ Params: { code: string } }>('/api/games/:code', async (request, reply) => {
    const code = normalizeCode(request.params.code);
    const runtime = isValidCode(code) ? registry.byActiveCode(code) : undefined;
    if (!runtime)
      return reply.code(404).send({ code: 'CODE_UNKNOWN', message: 'Aucune partie avec ce code.' });
    const s = runtime.state;
    return {
      gameId: s.gameId,
      code: s.code,
      status: s.status,
      players: s.players.length,
      maxPlayers: s.settings.maxPlayers,
      joinable: s.status === 'LOBBY' && s.players.length < s.settings.maxPlayers,
      takenColors: s.players.map((p) => p.color),
      takenNames: s.players.map((p) => p.name),
    };
  });

  app.get<{ Params: { code: string } }>('/api/games/:code/qr.svg', async (request, reply) => {
    const code = normalizeCode(request.params.code);
    const runtime = isValidCode(code) ? registry.byActiveCode(code) : undefined;
    if (!runtime)
      return reply.code(404).send({ code: 'CODE_UNKNOWN', message: 'Aucune partie avec ce code.' });
    const svg = await QRCode.toString(`${config.publicUrl}/play/${code}`, {
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
