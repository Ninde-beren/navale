import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Ce que le navigateur retient d'une partie pour s'y reconnecter. Jamais envoyé ailleurs qu'au serveur. */
export interface Session {
  gameId?: string;
  hostToken?: string;
  playerToken?: string;
  playerId?: string;
}

/**
 * Sessions par code de partie, gardées dans `localStorage` par `persist`. Si le
 * stockage est indisponible (navigation privée…), elles vivent jusqu'au rechargement.
 */
const useSessions = create<{ byCode: Record<string, Session> }>()(
  persist(() => ({ byCode: {} }), { name: 'navale.sessions' }),
);

export function getSession(code: string): Session {
  return useSessions.getState().byCode[code.toUpperCase()] ?? {};
}

function updateSession(code: string, change: (session: Session) => Session): void {
  const key = code.toUpperCase();
  const next = change(getSession(key));
  useSessions.setState((state) => ({ byCode: { ...state.byCode, [key]: next } }));
}

export function saveSession(code: string, patch: Session): void {
  updateSession(code, (session) => ({ ...session, ...patch }));
}

/** Oublie le joueur (départ, exclusion, jeton refusé) ; le jeton d'hôte reste. */
export function clearPlayer(code: string): void {
  updateSession(code, ({ playerToken: _token, playerId: _id, ...rest }) => rest);
}
