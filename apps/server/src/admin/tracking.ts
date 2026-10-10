import type { GameServer } from '../realtime/types.js';
import type { UsageMarks } from '../store/usage-marks.js';

/**
 * Posé par les pages de l'administration sur le navigateur de l'exploitant : ses
 * « Voir l'écran » ne comptent pas comme du jeu à distance. Un simple drapeau, pas un
 * secret ; il ne donne aucun droit.
 */
export const OBSERVER_COOKIE = 'navale_observateur';

export const observerCookieHeader = `${OBSERVER_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Strict; HttpOnly`;

export function hasObserverCookie(header: string | undefined): boolean {
  return (header ?? '').split(';').some((part) => part.trim() === `${OBSERVER_COOKIE}=1`);
}

/**
 * Jeu à distance : l'écran central d'une partie ouvert sans le jeton de l'hôte, donc
 * sur un autre appareil que celui qui l'a créée, par le lien partagé. À enregistrer
 * après `registerSockets` : la connexion est alors authentifiée, ou déjà refusée.
 */
export function trackRemoteBoards(io: GameServer, marks: UsageMarks): void {
  io.on('connection', (socket) => {
    const data = socket.data as Partial<typeof socket.data>;
    if (!socket.connected || !data.gameId || data.playerId || data.isHost) return;
    const auth = socket.handshake.auth as { kind?: unknown };
    if (auth.kind !== 'board') return;
    if (hasObserverCookie(socket.handshake.headers.cookie)) return;
    marks.mark(data.gameId, 'remote_board', Date.now());
  });
}
