import { z } from 'zod';
import type { Command } from './commands.js';
import type { Ack, Rejection } from './errors.js';
import type { VisibleEnvelope } from './events.js';
import type { GameView } from './views.js';

/**
 * Ce que présente un client à la connexion (`auth` de Socket.IO). Le serveur en
 * déduit la partie et le rôle ; aucune commande ne les redit ensuite.
 */
export const SocketAuthSchema = z.discriminatedUnion('kind', [
  /** Écran central ou spectateur, par le code ; avec le jeton d'hôte, les boutons de l'hôte. */
  z.object({ kind: z.literal('board'), code: z.string(), hostToken: z.string().optional() }),
  /** Joueur déjà inscrit, qui se reconnecte avec son jeton. */
  z.object({
    kind: z.literal('player'),
    code: z.string().optional(),
    token: z.string(),
    hostToken: z.string().optional(),
  }),
  /** Hôte seul, sans écran ni place de joueur. */
  z.object({ kind: z.literal('host'), token: z.string() }),
  /** Téléphone qui va choisir un pseudo et envoyer JOIN_GAME. */
  z.object({ kind: z.literal('join'), code: z.string() }),
]);
export type SocketAuth = z.infer<typeof SocketAuthSchema>;

/** Contenu de l'accusé d'un JOIN_GAME accepté : le jeton à garder pour se reconnecter. */
export const JoinedSchema = z.object({ playerId: z.string(), playerToken: z.string() });
export type Joined = z.infer<typeof JoinedSchema>;

/** Un joueur vient de se connecter, ou de perdre sa dernière connexion. */
export const PresenceChangeSchema = z.object({ playerId: z.string(), connected: z.boolean() });
export type PresenceChange = z.infer<typeof PresenceChangeSchema>;

/** Revanche : la nouvelle partie, qui garde le même code. */
export const RematchNoticeSchema = z.object({ gameId: z.string(), code: z.string() });
export type RematchNotice = z.infer<typeof RematchNoticeSchema>;

/** Le joueur a été retiré de la partie par l'hôte. */
export const RemovedNoticeSchema = z.object({ reason: z.literal('kicked') });
export type RemovedNotice = z.infer<typeof RemovedNoticeSchema>;

/**
 * Événements Socket.IO échangés entre clients et serveur. Le serveur et le web
 * typent leurs sockets avec ces interfaces : un nom d'événement mal orthographié
 * ou une charge utile de la mauvaise forme ne passe pas `pnpm typecheck`.
 *
 * C'est une vérification à la compilation seulement. Ce qu'un client envoie
 * reste une donnée non fiable : le serveur la valide avec `CommandSchema`.
 */

/** Ce que le serveur envoie aux clients. */
export interface ServerToClientEvents {
  /** Vue complète de la partie : à la connexion, sur demande, et après chaque lot d'événements. */
  snapshot: (view: GameView) => void;
  /** Un événement de la partie, dans la version que ce destinataire a le droit de voir. */
  event: (envelope: VisibleEnvelope) => void;
  presence: (change: PresenceChange) => void;
  /** Connexion refusée (code inconnu, jeton invalide…) ; le serveur coupe juste après. */
  rejected: (error: Pick<Rejection, 'code' | 'message'>) => void;
  /** La connexion est passée sur la partie de revanche. */
  rematch: (next: RematchNotice) => void;
  /** Envoyé au joueur retiré ; le serveur coupe juste après. */
  removed: (notice: RemovedNotice) => void;
}

/** Ce que les clients envoient : une commande, à laquelle le serveur répond par un accusé. */
export interface ClientToServerEvents {
  command: (command: Command, ack: (ack: Ack) => void) => void;
}
