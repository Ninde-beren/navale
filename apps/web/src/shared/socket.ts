import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Command, EventEnvelope } from '@navale/protocol';
import { useGame, type View } from './store.js';

export type SocketAuth =
  | { kind: 'board'; code: string; hostToken?: string }
  | { kind: 'player'; token: string; hostToken?: string }
  | { kind: 'join'; code: string };

/** Ouvre la connexion et branche le magasin. Une seule partie par onglet. */
export function openSocket(auth: SocketAuth): Socket {
  const store = useGame.getState();
  store.reset();
  store.setConn('connecting');
  const socket = io({ auth, transports: ['websocket', 'polling'] });
  socket.on('connect', () => useGame.getState().setConn('connected'));
  socket.on('disconnect', () => {
    const { conn } = useGame.getState();
    if (conn !== 'rejected' && conn !== 'removed') useGame.getState().setConn('disconnected');
  });
  socket.on('snapshot', (view: View) => useGame.getState().setView(view));
  socket.on('event', (env: EventEnvelope) => useGame.getState().pushEvent(env));
  socket.on('presence', (p: { playerId: string; connected: boolean }) =>
    useGame.getState().setPresence(p.playerId, p.connected),
  );
  socket.on('rejected', (err: { code: string; message: string }) =>
    useGame.getState().setConn('rejected', err),
  );
  socket.on('removed', () =>
    useGame
      .getState()
      .setConn('removed', { code: 'REMOVED', message: 'Tu as été retiré de la partie.' }),
  );
  return socket;
}

export function sendCommand(socket: Socket | null, command: Command): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket)
      return resolve({ ok: false, error: { code: 'WRONG_STATE', message: 'Pas de connexion.' } });
    socket.timeout(8000).emit('command', command, (err: Error | null, ack?: Ack) => {
      if (err || !ack)
        resolve({
          ok: false,
          error: { code: 'WRONG_STATE', message: 'Le serveur ne répond pas.' },
        });
      else resolve(ack);
    });
  });
}

/** Connexion liée au cycle de vie du composant. `key` change → reconnexion. */
export function useGameSocket(
  auth: SocketAuth | null,
  key: string,
): React.RefObject<Socket | null> {
  const ref = useRef<Socket | null>(null);
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
