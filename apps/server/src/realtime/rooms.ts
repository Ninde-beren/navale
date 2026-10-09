import type { GameServer, GameSocket } from './types.js';

/** Toutes les connexions d'une partie : écran central, téléphones, spectateurs. */
export const gameRoom = (gameId: string) => `game:${gameId}`;

/** Les connexions d'un joueur, qui reçoivent ses informations privées. */
export const playerRoom = (playerId: string) => `player:${playerId}`;

/** Les connexions présentes dans la room d'une partie. */
export function socketsInGame(io: GameServer, gameId: string): GameSocket[] {
  const ids = io.sockets.adapter.rooms.get(gameRoom(gameId)) ?? [];
  return [...ids].map((id) => io.sockets.sockets.get(id)).filter((socket) => socket !== undefined);
}
