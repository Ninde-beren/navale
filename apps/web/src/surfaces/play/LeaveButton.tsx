import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { clearPlayer } from '../../shared/session.js';
import { sendCommand } from '../../shared/socket.js';

/** Quitter le lobby : libère la place et oublie le jeton. Refusé par le serveur en partie. */
export function LeaveButton({
  code,
  socket,
  onLeft,
}: {
  code: string;
  socket: RefObject<Socket | null>;
  onLeft: () => void;
}) {
  return (
    <button
      className="btn sm ghost"
      type="button"
      onClick={async () => {
        if (!confirm('Quitter la partie ?')) return;
        const ack = await sendCommand(socket.current, { type: 'LEAVE_GAME' });
        if (ack.ok) {
          clearPlayer(code);
          onLeft();
        } else alert(ack.error.message);
      }}
    >
      Quitter la partie
    </button>
  );
}
