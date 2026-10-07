import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'CODE_UNKNOWN',
  'TOKEN_INVALID',
  'GAME_FULL',
  'GAME_NOT_JOINABLE',
  'NAME_TAKEN',
  'COLOR_TAKEN',
  'FLEET_INVALID',
  'FLEET_MISSING',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'PLAYERS_NOT_READY',
  'GAME_NOT_PLAYING',
  'GAME_NOT_FINISHED',
  'NOT_ALIVE',
  'NOT_YOUR_TURN',
  'ALREADY_COMMITTED',
  'TARGET_IS_SELF',
  'TARGET_NOT_ALIVE',
  'TARGET_NOT_LEGAL',
  'CELL_ALREADY_SHOT',
  'COORD_OUT_OF_BOUNDS',
  'WRONG_STATE',
  'LAST_HUMAN',
  'NOT_A_BOT',
  'PLAYER_UNKNOWN',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const RejectionSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type Rejection = z.infer<typeof RejectionSchema>;

export const AckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: RejectionSchema }),
]);
export type Ack = z.infer<typeof AckSchema>;

/** Erreur de placement renvoyée dans `details` de `FLEET_INVALID`. */
export const FleetErrorSchema = z.object({
  reason: z.enum(['WRONG_COMPOSITION', 'OUT_OF_BOUNDS', 'OVERLAP', 'TOUCHING']),
  /** Index des bateaux concernés dans la flotte soumise. */
  ships: z.array(z.number().int().min(0)),
  detail: z.string().optional(),
});
export type FleetError = z.infer<typeof FleetErrorSchema>;
