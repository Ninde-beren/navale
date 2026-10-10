import { z } from 'zod';
import {
  BetSchema,
  BotLevelSchema,
  ColorIdSchema,
  CoordSchema,
  GameSettingsSchema,
  GameStatusSchema,
  GhostCardSchema,
  GhostPlaySchema,
  LitCellSchema,
  PendingShotSchema,
  PlayerKindSchema,
  PlayerStatusSchema,
  RadarResultSchema,
  RankEntrySchema,
  ResolvedShotSchema,
  ShieldSchema,
  ShipSchema,
} from './common.js';

/** Vues : projections de l'état calculées côté serveur. Seules les vues sortent du serveur. */

export const PublicPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  color: ColorIdSchema,
  seat: z.number().int().min(0),
  kind: PlayerKindSchema,
  /** Bots seulement : leur niveau, pour l'afficher. */
  level: BotLevelSchema.optional(),
  status: PlayerStatusSchema,
  connected: z.boolean(),
  /** Humain absent relayé par un bot : le niveau de ce bot ; `null` sinon. */
  substitute: BotLevelSchema.nullable(),
  /** Son commandant (`settings.commanders`), s'il en a choisi un, et les usages qui lui restent. */
  commanderId: z.string().nullable(),
  abilityUsesLeft: z.number().int().min(0),
  /**
   * Les cases où un bouclier a arrêté un tir : le verre brisé, public. La zone du bouclier,
   * elle, reste secrète (`PrivateMe.shield`) : elle dirait où sont peut-être ses navires.
   */
  pierced: z.array(CoordSchema),
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
  /** Ses pronostics de fantôme : les bons, sur ceux qui ont compté. */
  bets: z.object({ won: z.number().int().min(0), total: z.number().int().min(0) }),
  /** Fantôme : la manche à partir de laquelle il peut jouer sa prochaine carte ; `null` sinon. */
  ghostReadyAt: z.number().int().min(0).nullable(),
  /** Les cases de sa grille qu'un fantôme a éclairées : navire ou eau, pour tous. */
  lit: z.array(LitCellSchema),
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

/** Ce qui empêche encore l'hôte de lancer la partie. */
export const StartBlockerSchema = z.enum(['NOT_ENOUGH_PLAYERS', 'NO_HUMAN', 'PLAYERS_NOT_READY']);
export type StartBlocker = z.infer<typeof StartBlockerSchema>;

export const BoardViewSchema = z.object({
  kind: z.literal('board'),
  gameId: z.string(),
  code: z.string(),
  status: GameStatusSchema,
  settings: GameSettingsSchema,
  players: z.array(PublicPlayerSchema),
  round: PublicRoundSchema.nullable(),
  /** Au lobby : `null` quand l'hôte peut lancer. Toujours `null` hors du lobby. */
  startBlocker: StartBlockerSchema.nullable(),
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
  /** Le joueur que la règle anti-acharnement m'interdit en ce moment, s'il y en a un. */
  antiFocusBlocked: z.string().nullable(),
  pendingShot: PendingShotSchema.nullable(),
  shotsFired: z.array(ResolvedShotSchema),
  canFire: z.boolean(),
  /** Je peux jouer ma capacité à la place d'un tir : mon tour, un usage restant. */
  canUseAbility: z.boolean(),
  /** Ce que mes radars et sonars ont appris, du plus ancien au plus récent. */
  radarResults: z.array(RadarResultSchema),
  /** Mes leurres : les cases de ma grille où j'ai posé un faux navire. */
  decoys: z.array(CoordSchema),
  /** Mon bouclier : sa zone, que je suis seul à voir, et ses cases percées ; `null` sans bouclier. */
  shield: ShieldSchema.nullable(),
  /** Fantôme : je peux pronostiquer la manche en cours. */
  canBet: z.boolean(),
  /** Mon pronostic sur la manche en cours, tant qu'elle n'est pas résolue. */
  bet: BetSchema.nullable(),
  /** Fantôme : les cartes que je peux jouer dans cette manche ; vide si je n'en ai pas. */
  ghostCards: z.array(GhostCardSchema),
  /** Fantôme : la carte que j'ai engagée pour cette manche. */
  ghostPlay: GhostPlaySchema.nullable(),
});
export type PrivateMe = z.infer<typeof PrivateMeSchema>;

export const PlayerViewSchema = BoardViewSchema.omit({ kind: true }).extend({
  kind: z.literal('player'),
  me: PrivateMeSchema,
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

/** Ce qu'un client reçoit : la vue publique (écran central) ou la vue d'un joueur. */
export type GameView = BoardView | PlayerView;
