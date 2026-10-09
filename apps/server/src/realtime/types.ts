import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@navale/protocol';

/** Ce que le serveur retient d'une connexion. Fixé à l'authentification, jamais lu dans une commande. */
export interface SocketData {
  gameId: string;
  /** `null` pour l'écran central, et pour un téléphone qui n'a pas encore rejoint. */
  playerId: string | null;
  isHost: boolean;
}

/** Une seule instance de serveur : aucun événement entre serveurs. */
type InterServerEvents = Record<string, never>;

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
