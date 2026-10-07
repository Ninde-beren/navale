import { create } from 'zustand';
import type { BoardView, EventEnvelope, PlayerView } from '@navale/protocol';

export type View = BoardView | PlayerView;
export type ConnState =
  'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected' | 'removed';

interface GameStore {
  view: View | null;
  conn: ConnState;
  error: { code: string; message: string } | null;
  events: EventEnvelope[];
  setView: (view: View) => void;
  setConn: (conn: ConnState, error?: { code: string; message: string } | null) => void;
  pushEvent: (env: EventEnvelope) => void;
  setPresence: (playerId: string, connected: boolean) => void;
  /** Revanche : la connexion bascule sur une nouvelle partie, les événements de l'ancienne ne comptent plus. */
  switchGame: () => void;
  reset: () => void;
}

export const useGame = create<GameStore>((set) => ({
  view: null,
  conn: 'idle',
  error: null,
  events: [],
  setView: (view) => set({ view }),
  setConn: (conn, error = null) => set({ conn, error }),
  pushEvent: (env) => set((s) => ({ events: [...s.events.slice(-49), env] })),
  setPresence: (playerId, connected) =>
    set((s) =>
      s.view
        ? {
            view: {
              ...s.view,
              players: s.view.players.map((p) =>
                p.playerId === playerId ? { ...p, connected } : p,
              ),
            },
          }
        : {},
    ),
  switchGame: () => set({ events: [] }),
  reset: () => set({ view: null, conn: 'idle', error: null, events: [] }),
}));

export function isPlayerView(v: View | null): v is PlayerView {
  return v?.kind === 'player';
}
