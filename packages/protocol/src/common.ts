import { z } from 'zod';

// ---- Coordonnées et orientation ------------------------------------------------

export const CoordSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) });
export type Coord = z.infer<typeof CoordSchema>;

export const OrientationSchema = z.enum(['H', 'V']);
export type Orientation = z.infer<typeof OrientationSchema>;

/** `{ x: 3, y: 6 }` → `D7` (lettre = colonne, chiffre = ligne + 1). */
export function coordLabel(c: Coord): string {
  return `${String.fromCharCode(65 + c.x)}${c.y + 1}`;
}

/** `D7` → `{ x: 3, y: 6 }`, ou `null` si le libellé est malformé. */
export function parseCoordLabel(label: string): Coord | null {
  const m = /^([A-Z])(\d{1,2})$/.exec(label.trim().toUpperCase());
  if (!m) return null;
  const x = m[1]!.charCodeAt(0) - 65;
  const y = Number(m[2]) - 1;
  return y >= 0 ? { x, y } : null;
}

// ---- Énumérations -------------------------------------------------------------

export const VariantSchema = z.enum(['sequential', 'simultaneous']);
export type Variant = z.infer<typeof VariantSchema>;

export const EndConditionSchema = z.enum(['last_standing', 'first_fleet_sunk']);
export type EndCondition = z.infer<typeof EndConditionSchema>;

export const SunkRevealSchema = z.enum(['classic', 'secret']);
export type SunkReveal = z.infer<typeof SunkRevealSchema>;

/** Salve : ordre de résolution, donc d'animation et de crédit du coulé. `commit` = le plus rapide à engager d'abord. */
export const SalvoOrderSchema = z.enum(['commit', 'seats']);
export type SalvoOrder = z.infer<typeof SalvoOrderSchema>;

export const ColorIdSchema = z.enum([
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'teal',
  'pink',
]);
export type ColorId = z.infer<typeof ColorIdSchema>;
export const COLOR_IDS: readonly ColorId[] = ColorIdSchema.options;

export const ShotResultSchema = z.enum(['MISS', 'HIT', 'SUNK']);
export type ShotResult = z.infer<typeof ShotResultSchema>;

export const GameStatusSchema = z.enum(['LOBBY', 'PLAYING', 'FINISHED', 'CANCELLED']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const PlayerStatusSchema = z.enum(['PLACING', 'READY', 'ALIVE', 'ELIMINATED']);
export type PlayerStatus = z.infer<typeof PlayerStatusSchema>;

export const PlayerKindSchema = z.enum(['human', 'bot']);
export type PlayerKind = z.infer<typeof PlayerKindSchema>;

/** Seul `normal` est implémenté dans le MVP. */
export const BotLevelSchema = z.enum(['easy', 'normal', 'hard']);
export type BotLevel = z.infer<typeof BotLevelSchema>;

export const PresetIdSchema = z.enum(['classic', 'quick']);
export type PresetId = z.infer<typeof PresetIdSchema>;

// ---- Paramètres de partie ------------------------------------------------------

export const ShipSpecSchema = z.object({
  type: z.string().min(1).max(32),
  size: z.number().int().min(1).max(12),
});
export type ShipSpec = z.infer<typeof ShipSpecSchema>;

/** Libellés français des types de bateaux des presets. */
export const SHIP_LABELS_FR: Readonly<Record<string, string>> = {
  carrier: 'Porte-avions',
  cruiser: 'Croiseur',
  destroyer: 'Contre-torpilleur',
  torpedo: 'Torpilleur',
};

export const GameSettingsSchema = z.object({
  variant: VariantSchema,
  endCondition: EndConditionSchema.default('last_standing'),
  sunkReveal: SunkRevealSchema.default('classic'),
  maxPlayers: z.number().int().min(2).max(4),
  grid: z.object({
    width: z.number().int().min(6).max(12),
    height: z.number().int().min(6).max(12),
  }),
  fleet: z.array(ShipSpecSchema).min(1).max(8),
  shipsMayTouch: z.boolean().default(true),
  roundTimerSeconds: z.number().int().min(15).max(300).nullable().default(null),
  revealDelayMs: z.number().int().min(0).max(10000).default(2500),
  salvoOrder: SalvoOrderSchema.default('commit'),
});
export type GameSettings = z.infer<typeof GameSettingsSchema>;
export type GameSettingsInput = z.input<typeof GameSettingsSchema>;

// ---- Flotte et tirs ------------------------------------------------------------

export const ShipPlacementSchema = z.object({
  type: z.string().min(1).max(32),
  bow: CoordSchema,
  orientation: OrientationSchema,
});
export type ShipPlacement = z.infer<typeof ShipPlacementSchema>;

export const ShipSchema = z.object({
  shipId: z.string(),
  type: z.string(),
  size: z.number().int().min(1),
  bow: CoordSchema,
  orientation: OrientationSchema,
  cells: z.array(CoordSchema),
  hits: z.array(CoordSchema),
});
export type Ship = z.infer<typeof ShipSchema>;

export const PendingShotSchema = z.object({ targetId: z.string(), coord: CoordSchema });
export type PendingShot = z.infer<typeof PendingShotSchema>;

export const SunkInfoSchema = z.object({
  shipId: z.string(),
  size: z.number().int().min(1),
  /** Renseigné seulement si `sunkReveal === 'classic'`. */
  cells: z.array(CoordSchema).optional(),
});
export type SunkInfo = z.infer<typeof SunkInfoSchema>;

export const ResolvedShotSchema = z.object({
  round: z.number().int().min(0),
  shooterId: z.string(),
  targetId: z.string(),
  coord: CoordSchema,
  result: ShotResultSchema,
  sunk: SunkInfoSchema.optional(),
});
export type ResolvedShot = z.infer<typeof ResolvedShotSchema>;

export const RankEntrySchema = z.object({
  playerId: z.string(),
  rank: z.number().int().min(1),
  shotsFired: z.number().int().min(0),
  hits: z.number().int().min(0),
  /** 0 à 1, arrondi à trois décimales. */
  accuracy: z.number().min(0).max(1),
  shipsSunk: z.number().int().min(0),
  playersEliminated: z.number().int().min(0),
  cellsRemaining: z.number().int().min(0),
});
export type RankEntry = z.infer<typeof RankEntrySchema>;
