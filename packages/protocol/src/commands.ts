import { z } from 'zod';
import { BotLevelSchema, ColorIdSchema, CoordSchema, ShipPlacementSchema } from './common.js';

const Name = z.string().trim().min(2).max(16);

/** Commandes : intentions envoyées par un client. Le serveur peut les refuser. */
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('JOIN_GAME'), name: Name, color: ColorIdSchema }),
  z.object({ type: z.literal('LEAVE_GAME') }),
  z.object({
    type: z.literal('UPDATE_PROFILE'),
    name: Name.optional(),
    color: ColorIdSchema.optional(),
  }),
  z.object({ type: z.literal('PLACE_FLEET'), ships: z.array(ShipPlacementSchema).max(8) }),
  z.object({ type: z.literal('SET_READY'), ready: z.boolean() }),
  z.object({ type: z.literal('KICK_PLAYER'), playerId: z.string() }),
  z.object({ type: z.literal('ADD_BOT'), level: BotLevelSchema.optional() }),
  z.object({ type: z.literal('REMOVE_BOT'), playerId: z.string() }),
  z.object({ type: z.literal('START_GAME') }),
  z.object({ type: z.literal('FIRE'), targetId: z.string(), coord: CoordSchema }),
  z.object({ type: z.literal('FORCE_ROUND') }),
  z.object({ type: z.literal('CANCEL_GAME'), reason: z.string().max(80).optional() }),
  z.object({ type: z.literal('REMATCH') }),
  z.object({ type: z.literal('REQUEST_SNAPSHOT') }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandOf<T extends Command['type']> = Extract<Command, { type: T }>;

/** Qui émet la commande. Déduit par le serveur du jeton de la connexion, jamais du payload. */
export const ActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), playerId: z.string() }),
  z.object({ kind: z.literal('host') }),
  z.object({ kind: z.literal('system') }),
  z.object({ kind: z.literal('join') }),
]);
export type Actor = z.infer<typeof ActorSchema>;
