import { useEffect, useRef, type RefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  Command,
  ServerToClientEvents,
  SocketAuth,
} from '@navale/protocol';
import { saveSession } from './session.js';
import { useGame } from './store.js';

/** Connexion à une partie, typée par le contrat d'événements de `@navale/protocol`. */
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** La connexion telle que les écrans la reçoivent : `null` tant qu'elle n'est pas ouverte. */
export type SocketRef = RefObject<GameSocket | null>;

/** Au-delà, une commande sans accusé de réception est considérée comme perdue. */
const ACK_TIMEOUT_MS = 8000;

/** Ouvre la connexion et branche le magasin. Une seule partie par onglet. */
export function openSocket(auth: SocketAuth): GameSocket {
  const game = useGame.getState();
  game.reset();
  game.setConn('connecting');
  // Polling d'abord, puis montée en WebSocket si possible : si la montée échoue, la connexion reste.
  const socket: GameSocket = io({ auth, transports: ['polling', 'websocket'] });
  socket.on('connect', () => useGame.getState().setConn('connected'));
  socket.on('disconnect', () => {
    const { conn, setConn } = useGame.getState();
    if (conn !== 'rejected' && conn !== 'removed') setConn('disconnected');
  });
  socket.on('snapshot', (view) => useGame.getState().setView(view));
  socket.on('event', (envelope) => useGame.getState().pushEvent(envelope));
  socket.on('presence', ({ playerId, connected }) =>
    useGame.getState().setPresence(playerId, connected),
  );
  socket.on('rejected', (error) => useGame.getState().setConn('rejected', error));
  socket.on('rematch', ({ gameId, code }) => {
    useGame.getState().switchGame();
    saveSession(code, { gameId });
  });
  socket.on('removed', () =>
    useGame
      .getState()
      .setConn('removed', { code: 'REMOVED', message: 'Tu as été retiré de la partie.' }),
  );
  return socket;
}

/**
 * Envoie une commande et attend l'accusé du serveur. Ne rejette jamais : une
 * connexion absente ou un serveur muet donnent un refus, affichable tel quel.
 */
export async function sendCommand(socket: GameSocket | null, command: Command): Promise<Ack> {
  if (!socket) return refusal('Pas de connexion.');
  try {
    return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('command', command);
  } catch {
    return refusal('Le serveur ne répond pas.');
  }
}

function refusal(message: string): Ack {
  return { ok: false, error: { code: 'WRONG_STATE', message } };
}

/** Connexion liée au cycle de vie du composant. `key` change → reconnexion. */
export function useGameSocket(auth: SocketAuth | null, key: string): SocketRef {
  const ref = useRef<GameSocket | null>(null);
  useEffect(() => {
    if (!auth) return;
    const socket = openSocket(auth);
    ref.current = socket;
    return () => {
      socket.close();
      ref.current = null;
    };
  }, [key]);
  return ref;
}
