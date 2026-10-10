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

/** `BLOCKED` : le tir est tombé sur une case qu'un bouclier protège encore, rien n'est touché ni révélé. */
export const ShotResultSchema = z.enum(['MISS', 'HIT', 'SUNK', 'BLOCKED']);
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

// ---- Commandants et capacités ----------------------------------------------------

export const AbilityTypeSchema = z.enum(['radar', 'sonar', 'missile', 'repair', 'shield', 'decoy']);
export type AbilityType = z.infer<typeof AbilityTypeSchema>;

/**
 * Une capacité, décrite par ses réglages. Chez un adversaire : le radar montre les
 * cases de navire d'une zone carrée centrée sur la case visée, le sonar n'en donne
 * que le total, sur une zone plus grande, le missile frappe une case et ses quatre
 * voisines. Sur sa propre flotte : la réparation remet en état une case touchée d'un
 * bateau non coulé, le bouclier protège une zone pour toute la partie (chaque case
 * arrête un tir), le leurre pose un faux navire sur une case vide.
 */
export const AbilitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('radar'), size: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal('sonar'), size: z.number().int().min(1).max(7) }),
  z.object({ type: z.literal('missile'), pattern: z.enum(['cross']) }),
  z.object({ type: z.literal('repair') }),
  z.object({
    type: z.literal('shield'),
    size: z.number().int().min(1).max(5),
  }),
  z.object({ type: z.literal('decoy') }),
]);
export type Ability = z.infer<typeof AbilitySchema>;

/** Un commandant : un nom et une capacité, utilisable `uses` fois par partie. */
export const CommanderSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(32),
  ability: AbilitySchema,
  uses: z.number().int().min(1).max(5),
});
export type Commander = z.infer<typeof CommanderSchema>;

// ---- Paramètres de partie ------------------------------------------------------

export const ShipSpecSchema = z.object({
  type: z.string().min(1).max(32),
  size: z.number().int().min(1).max(12),
});
export type ShipSpec = z.infer<typeof ShipSpecSchema>;

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
  /**
   * Anti-acharnement : au plus N tirs de suite d'un même tireur sur un même joueur,
   * tant qu'il reste une autre cible ; `null` = libre. Sans effet à deux joueurs.
   */
  antiFocusMaxStreak: z.number().int().min(1).max(10).nullable().default(null),
  /**
   * Joueur absent : quand un humain attendu pour tirer est déconnecté depuis ce
   * délai, un bot tire pour lui jusqu'à son retour ; `null` = on l'attend.
   */
  afkBotSeconds: z.number().int().min(1).max(600).nullable().default(45),
  /** Niveau du bot qui relaie un joueur absent. */
  afkBotLevel: BotLevelSchema.default('normal'),
  /** Commandants proposés aux joueurs ; vide = partie sans capacités. */
  commanders: z.array(CommanderSchema).max(8).default([]),
});
export type GameSettings = z.infer<typeof GameSettingsSchema>;

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

/** L'action engagée pour la manche : un tir, ou une capacité visant cette case. */
export const PendingShotSchema = z.object({
  targetId: z.string(),
  coord: CoordSchema,
  ability: AbilityTypeSchema.optional(),
});
export type PendingShot = z.infer<typeof PendingShotSchema>;

/**
 * Ce qu'un radar a appris, privé : seul son auteur reçoit `shipCells` et `contacts`.
 * `contacts` = les cases de la zone qui portent un navire ; absent des radars joués
 * avant le 2026-10-10 au soir, qui ne donnaient que le total.
 */
export const RadarResultSchema = z.object({
  round: z.number().int().min(0),
  targetId: z.string(),
  center: CoordSchema,
  size: z.number().int().min(1),
  shipCells: z.number().int().min(0),
  contacts: z.array(CoordSchema).optional(),
  /** Le sonar ne donne que le total ; absent = radar. */
  ability: z.enum(['radar', 'sonar']).optional(),
});
export type RadarResult = z.infer<typeof RadarResultSchema>;

/**
 * Un bouclier levé sur une flotte : public, la zone est connue de tous, comme les cases
 * qu'un premier tir a percées (`pierced`) et qui ne protègent plus rien.
 */
export const ShieldSchema = z.object({
  center: CoordSchema,
  size: z.number().int().min(1),
  pierced: z.array(CoordSchema),
});
export type Shield = z.infer<typeof ShieldSchema>;

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
  /** Missile : la rafale dont ce tir fait partie, son centre et son nombre de tirs. */
  burst: z.object({ center: CoordSchema, size: z.number().int().min(1) }).optional(),
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
