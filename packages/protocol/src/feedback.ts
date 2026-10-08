import { z } from 'zod';

/** Contexte joint automatiquement par le client à un retour : où il était, sur quel écran. */
export const FeedbackContextSchema = z.object({
  /** Chemin de la page (`/board/ABCD`, `/create`…). */
  path: z.string().max(200),
  /** Code de la partie si la page en a un. */
  code: z.string().max(8).optional(),
  /** Taille de la fenêtre, `1366×657`. */
  screen: z.string().max(40).optional(),
});
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

/** Un retour envoyé depuis le bouton « Un avis ? » : message libre, e-mail facultatif. */
export const FeedbackSchema = z.object({
  message: z.string().trim().min(3).max(2000),
  email: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
  context: FeedbackContextSchema,
});
export type Feedback = z.infer<typeof FeedbackSchema>;
