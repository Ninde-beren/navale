import { z } from 'zod';
import {
  ColorIdSchema,
  CoordSchema,
  GameSettingsSchema,
  GameStatusSchema,
  PendingShotSchema,
  PlayerKindSchema,
  PlayerStatusSchema,
  RankEntrySchema,
  ResolvedShotSchema,
  ShipSchema,
} from './common.js';

/** Vues : projections de l'état calculées côté serveur. Seules les vues sortent du serveur. */

export const PublicPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  color: ColorIdSchema,
  seat: z.number().int().min(0),
  kind: PlayerKindSchema,
  status: PlayerStatusSchema,
  connected: z.boolean(),
  shipsRemaining: z.number().int().min(0),
  revealed: z.array(z.object({ coord: CoordSchema, result: z.enum(['MISS', 'HIT']) })),
  sunkShips: z.array(
    z.object({
      shipId: z.string(),
      size: z.number().int().min(1),
      cells: z.array(CoordSchema).optional(),
    }),
  ),
  rank: z.number().int().min(1).nullable(),
});
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

export const PublicRoundSchema = z.object({
  index: z.number().int().min(0),
  expectedShooters: z.array(z.string()),
  committed: z.array(z.string()),
  activePlayerId: z.string().nullable(),
  deadline: z.number().nullable(),
});
export type PublicRound = z.infer<typeof PublicRoundSchema>;

export const BoardViewSchema = z.object({
  kind: z.literal('board'),
  gameId: z.string(),
  code: z.string(),
  status: GameStatusSchema,
  settings: GameSettingsSchema,
  players: z.array(PublicPlayerSchema),
  round: PublicRoundSchema.nullable(),
  lastShots: z.array(ResolvedShotSchema),
  ranking: z.array(RankEntrySchema).nullable(),
  isHost: z.boolean(),
  seq: z.number().int().min(0),
});
export type BoardView = z.infer<typeof BoardViewSchema>;

export const PrivateMeSchema = z.object({
  playerId: z.string(),
  fleet: z.array(ShipSchema),
  cellsRemaining: z.number().int().min(0),
  legalTargets: z.array(z.string()),
  pendingShot: PendingShotSchema.nullable(),
  shotsFired: z.array(ResolvedShotSchema),
  canFire: z.boolean(),
});
export type PrivateMe = z.infer<typeof PrivateMeSchema>;

export const PlayerViewSchema = BoardViewSchema.omit({ kind: true }).extend({
  kind: z.literal('player'),
  me: PrivateMeSchema,
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;
