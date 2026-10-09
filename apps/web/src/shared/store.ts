import { useMemo } from 'react';
import { create } from 'zustand';
import type { GameView, PlayerView, PublicRound, VisibleEnvelope } from '@navale/protocol';

export type ConnState =
  'idle' | 'connecting' | 'connected' | 'disconnected' | 'rejected' | 'removed';

interface GameStore {
  view: GameView | null;
  conn: ConnState;
  error: { code: string; message: string } | null;
  events: VisibleEnvelope[];
  setView: (view: GameView) => void;
  setConn: (conn: ConnState, error?: { code: string; message: string } | null) => void;
  pushEvent: (envelope: VisibleEnvelope) => void;
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
  // Les 50 derniers suffisent : l'instantané fait foi, les événements ne servent qu'à anticiper.
  pushEvent: (envelope) => set((s) => ({ events: [...s.events.slice(-49), envelope] })),
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

export function isPlayerView(v: GameView | null): v is PlayerView {
  return v?.kind === 'player';
}

/**
 * Qui a déjà tiré dans la manche, dans l'ordre d'engagement : l'instantané,
 * complété par les SHOT_COMMITTED reçus depuis.
 */
export function useCommittedShooters(round: PublicRound | null): string[] {
  const events = useGame((s) => s.events);
  return useMemo(() => {
    const committed = [...(round?.committed ?? [])];
    for (const { event } of events) {
      if (
        event.type === 'SHOT_COMMITTED' &&
        event.round === round?.index &&
        !committed.includes(event.shooterId)
      )
        committed.push(event.shooterId);
    }
    return committed;
  }, [round, events]);
}

/** La résolution de la manche a commencé : un premier tir est résolu, l'instantané suivant n'est pas encore là. */
export function useRoundResolving(roundIndex: number): boolean {
  return useGame((s) =>
    s.events.some((e) => e.event.type === 'SHOT_RESOLVED' && e.event.round === roundIndex),
  );
}
