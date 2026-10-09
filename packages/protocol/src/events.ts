import { z } from 'zod';
import {
  AbilityTypeSchema,
  BotLevelSchema,
  ColorIdSchema,
  CoordSchema,
  GameSettingsSchema,
  PlayerKindSchema,
  RadarResultSchema,
  RankEntrySchema,
  ResolvedShotSchema,
  ShipSchema,
} from './common.js';

/** Privé : seul le propriétaire de la flotte reçoit `ships`. */
const FleetPlacedSchema = z.object({
  type: z.literal('FLEET_PLACED'),
  playerId: z.string(),
  ships: z.array(ShipSchema),
});

/** Privé : seul le tireur reçoit `targetId` et `coord` avant la résolution de la salve. */
const ShotCommittedSchema = z.object({
  type: z.literal('SHOT_COMMITTED'),
  round: z.number().int().min(0),
  shooterId: z.string(),
  targetId: z.string(),
  coord: CoordSchema,
  /** Une capacité engagée à la place d'un tir ; le type, lui, est public. */
  ability: AbilityTypeSchema.optional(),
});

/** Privé : seul l'auteur du radar reçoit `shipCells` et `contacts`. */
const RadarResultEventSchema = RadarResultSchema.extend({
  type: z.literal('RADAR_RESULT'),
  playerId: z.string(),
});

/**
 * Événements : faits accomplis publiés par le serveur et ajoutés au journal.
 * Le journal stocke la forme complète ci-dessous. Les clients reçoivent un
 * `VisibleEvent` : la même chose, moins les champs privés auxquels ils n'ont pas droit.
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
    /** Bots seulement : le niveau choisi par l'hôte, `normal` par défaut. */
    level: BotLevelSchema.optional(),
  }),
  z.object({ type: z.literal('PLAYER_LEFT'), playerId: z.string() }),
  z.object({ type: z.literal('PLAYER_KICKED'), playerId: z.string() }),
  z.object({
    type: z.literal('PLAYER_PROFILE_UPDATED'),
    playerId: z.string(),
    name: z.string(),
    color: ColorIdSchema,
  }),
  FleetPlacedSchema,
  z.object({ type: z.literal('PLAYER_READY_CHANGED'), playerId: z.string(), ready: z.boolean() }),
  z.object({ type: z.literal('COMMANDER_CHOSEN'), playerId: z.string(), commanderId: z.string() }),
  z.object({
    type: z.literal('GAME_STARTED'),
    settings: GameSettingsSchema,
    seats: z.array(z.string()),
    startedAt: z.number(),
  }),
  z.object({
    type: z.literal('ROUND_STARTED'),
    round: z.number().int().min(0),
    expectedShooters: z.array(z.string()),
    startedAt: z.number(),
    deadline: z.number().nullable(),
  }),
  ShotCommittedSchema,
  /** Une capacité jouée : qui, laquelle, sur qui et où. Ses effets suivent (radar, réparation, tirs). */
  z.object({
    type: z.literal('ABILITY_USED'),
    round: z.number().int().min(0),
    playerId: z.string(),
    ability: AbilityTypeSchema,
    targetId: z.string(),
    coord: CoordSchema,
  }),
  RadarResultEventSchema,
  z.object({
    type: z.literal('SHIP_REPAIRED'),
    round: z.number().int().min(0),
    playerId: z.string(),
    coord: CoordSchema,
  }),
  ResolvedShotSchema.extend({ type: z.literal('SHOT_RESOLVED') }),
  z.object({
    type: z.literal('PLAYER_ELIMINATED'),
    playerId: z.string(),
    round: z.number().int().min(0),
    rank: z.number().int().min(1),
  }),
  /** Un bot tire pour ce joueur absent, à ce niveau, jusqu'à son retour. */
  z.object({ type: z.literal('PLAYER_SUBSTITUTED'), playerId: z.string(), level: BotLevelSchema }),
  /** Le joueur est revenu : il reprend sa flotte, le bot s'efface. */
  z.object({ type: z.literal('PLAYER_RESUMED'), playerId: z.string() }),
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

/**
 * Un événement tel qu'un client le reçoit : complet s'il y a droit, sinon sans ses
 * champs privés. On sait qu'un joueur a placé sa flotte ou engagé son tir, pas où.
 */
export const VisibleEventSchema = z.union([
  GameEventSchema,
  FleetPlacedSchema.omit({ ships: true }),
  ShotCommittedSchema.omit({ targetId: true, coord: true }),
  RadarResultEventSchema.omit({ shipCells: true, contacts: true }),
]);
export type VisibleEvent = z.infer<typeof VisibleEventSchema>;

export const VisibleEnvelopeSchema = EventEnvelopeSchema.extend({ event: VisibleEventSchema });
export type VisibleEnvelope = z.infer<typeof VisibleEnvelopeSchema>;
