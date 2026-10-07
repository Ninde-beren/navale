import { z } from 'zod';
import {
  ColorIdSchema,
  CoordSchema,
  GameSettingsSchema,
  PlayerKindSchema,
  RankEntrySchema,
  ResolvedShotSchema,
  ShipSchema,
} from './common.js';

/**
 * Événements : faits accomplis publiés par le serveur et ajoutés au journal.
 * Le journal stocke la forme complète ci-dessous ; le serveur en dérive une vue
 * publique et, pour certains, une vue privée (voir docs/05-protocole.md).
 */
export const GameEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('GAME_CREATED'),
    gameId: z.string(),
    code: z.string(),
    settings: GameSettingsSchema,
    createdAt: z.number(),
  }),
  z.object({
    type: z.literal('PLAYER_JOINED'),
    playerId: z.string(),
    name: z.string(),
    color: ColorIdSchema,
    seat: z.number().int().min(0),
    kind: PlayerKindSchema,
  }),
  z.object({ type: z.literal('PLAYER_LEFT'), playerId: z.string() }),
  z.object({ type: z.literal('PLAYER_KICKED'), playerId: z.string() }),
  z.object({
    type: z.literal('PLAYER_PROFILE_UPDATED'),
    playerId: z.string(),
    name: z.string(),
    color: ColorIdSchema,
  }),
  /** Privé : `ships` n'est envoyé qu'au propriétaire. */
  z.object({ type: z.literal('FLEET_PLACED'), playerId: z.string(), ships: z.array(ShipSchema) }),
  z.object({ type: z.literal('PLAYER_READY_CHANGED'), playerId: z.string(), ready: z.boolean() }),
  z.object({
    type: z.literal('GAME_STARTED'),
    settings: GameSettingsSchema,
    seats: z.array(z.string()),
    startedAt: z.number(),
  }),
  /** Privé : chaque tireur attendu ne reçoit que ses propres `legalTargets`. */
  z.object({
    type: z.literal('ROUND_STARTED'),
    round: z.number().int().min(0),
    expectedShooters: z.array(z.string()),
    startedAt: z.number(),
    deadline: z.number().nullable(),
    legalTargets: z.record(z.string(), z.array(z.string())),
  }),
  /** Privé : `targetId` et `coord` ne sont envoyés qu'au tireur. */
  z.object({
    type: z.literal('SHOT_COMMITTED'),
    round: z.number().int().min(0),
    shooterId: z.string(),
    targetId: z.string(),
    coord: CoordSchema,
  }),
  ResolvedShotSchema.extend({ type: z.literal('SHOT_RESOLVED') }),
  z.object({
    type: z.literal('PLAYER_ELIMINATED'),
    playerId: z.string(),
    round: z.number().int().min(0),
    rank: z.number().int().min(1),
  }),
  z.object({
    type: z.literal('ROUND_RESOLVED'),
    round: z.number().int().min(0),
    skipped: z.array(z.string()),
  }),
  z.object({
    type: z.literal('GAME_FINISHED'),
    ranking: z.array(RankEntrySchema),
    winnerId: z.string().nullable(),
    finishedAt: z.number(),
  }),
  z.object({ type: z.literal('GAME_CANCELLED'), reason: z.enum(['host', 'expired']) }),
  z.object({ type: z.literal('REMATCH_CREATED'), newGameId: z.string(), code: z.string() }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameEventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

export const EventEnvelopeSchema = z.object({
  seq: z.number().int().min(1),
  at: z.number(),
  event: GameEventSchema,
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
