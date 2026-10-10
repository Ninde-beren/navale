import { z } from 'zod';
import { ColorIdSchema, GameSettingsSchema, GameStatusSchema, PresetIdSchema } from './common.js';
import { EventEnvelopeSchema } from './events.js';

/**
 * `POST /api/games`. Seuls la variante et le nombre de joueurs sont obligatoires :
 * la grille et la flotte viennent du preset, le reste des valeurs par défaut.
 */
export const CreateGameRequestSchema = z.object({
  settings: GameSettingsSchema.partial().required({ variant: true, maxPlayers: true }),
  preset: PresetIdSchema.optional(),
});
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;

export const CreateGameResponseSchema = z.object({
  gameId: z.string(),
  code: z.string(),
  /** À garder dans le navigateur qui a créé la partie : il donne les boutons de l'hôte. */
  hostToken: z.string(),
  boardUrl: z.string(),
  joinUrl: z.string(),
});
export type CreateGameResponse = z.infer<typeof CreateGameResponseSchema>;

/** `GET /api/games/:code` : de quoi savoir si l'on peut encore rejoindre, sans rien de privé. */
export const GameInfoSchema = z.object({
  gameId: z.string(),
  code: z.string(),
  status: GameStatusSchema,
  players: z.number().int().min(0),
  maxPlayers: z.number().int(),
  joinable: z.boolean(),
  takenColors: z.array(ColorIdSchema),
  takenNames: z.array(z.string()),
});
export type GameInfo = z.infer<typeof GameInfoSchema>;

/** D'où vient un partage de la partie : l'écran central (lobby) ou un téléphone. */
export const ShareSourceSchema = z.enum(['board', 'phone']);
export type ShareSource = z.infer<typeof ShareSourceSchema>;

/**
 * `POST /api/games/:code/shared` : le bouton de partage a servi (feuille de partage ou
 * lien copié). Une mesure anonyme pour savoir si l'on joue sur place ou à distance.
 */
export const GameSharedRequestSchema = z.object({ from: ShareSourceSchema });
export type GameSharedRequest = z.infer<typeof GameSharedRequestSchema>;

/**
 * `POST /api/games/:code/host-link` (le lien d'hôte et son QR, pour les montrer) et
 * `POST /api/games/:code/host-link/opened` (le lien ouvert sur un autre appareil) : le jeton
 * d'hôte prouve que la demande vient de l'hôte de cette partie.
 */
export const HostLinkRequestSchema = z.object({ hostToken: z.string().min(1).max(128) });
export type HostLinkRequest = z.infer<typeof HostLinkRequestSchema>;

/**
 * Le lien d'hôte : l'appareil qui l'ouvre reçoit les boutons de l'hôte, celui qui l'a
 * montré les garde. Le jeton y suit un `#`, le navigateur ne l'envoie dans aucune requête.
 */
export const HostLinkSchema = z.object({
  url: z.string(),
  /** Le QR code du lien, en SVG. */
  qr: z.string(),
});
export type HostLink = z.infer<typeof HostLinkSchema>;

/**
 * `GET /api/games/:gameId/replay` : le journal complet d'une partie terminée, pour la revoir,
 * pendant 24 h après sa fin (`expiresAt`). Une fois la partie finie, plus rien n'y est secret :
 * flottes, détections et pronostics compris.
 */
export const ReplaySchema = z.object({
  gameId: z.string(),
  code: z.string(),
  events: z.array(EventEnvelopeSchema),
  /** Quand le serveur cessera de la servir : passé ce moment, seul un fichier exporté la garde. */
  expiresAt: z.number(),
});
export type Replay = z.infer<typeof ReplaySchema>;

/**
 * Une partie exportée, pour la revoir plus tard dans le navigateur, sans le serveur : le
 * journal complet d'une partie terminée. Le fichier vient de n'importe où : le lecteur le
 * valide entièrement avant de le rejouer.
 */
export const ReplayFileSchema = z.object({
  format: z.literal('navale-replay'),
  version: z.literal(1),
  gameId: z.string().max(64),
  code: z.string().max(16),
  exportedAt: z.number(),
  events: z.array(EventEnvelopeSchema).min(1).max(20_000),
});
export type ReplayFile = z.infer<typeof ReplayFileSchema>;
