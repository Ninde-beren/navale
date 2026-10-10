import { z } from 'zod';
import { ColorIdSchema, GameSettingsSchema, GameStatusSchema, PresetIdSchema } from './common.js';

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
