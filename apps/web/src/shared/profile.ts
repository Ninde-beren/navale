import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameView } from '@navale/protocol';
import { myRank, outcomeOf, tally, withResult, type Outcome, type Results } from './record.js';
import { isPlayerView } from './store.js';

interface Profile {
  /** Dernier pseudo saisi, proposé au prochain « Rejoindre ». */
  name: string;
  results: Results;
}

/**
 * Ce que l'appareil retient du joueur : son pseudo et son bilan, dans `localStorage`.
 * Jamais envoyé au serveur ; sans stockage (navigation privée…), ça vit jusqu'au rechargement.
 */
export const useProfile = create<Profile>()(
  persist(() => ({ name: '', results: {} }), { name: 'navale.profile' }),
);

export function rememberName(name: string): void {
  if (name !== useProfile.getState().name) useProfile.setState({ name });
}

/** Note l'issue d'une partie ; une partie déjà notée ne change rien. */
export function recordResult(gameId: string, outcome: Outcome): void {
  const { results } = useProfile.getState();
  const next = withResult(results, gameId, outcome);
  if (next !== results) useProfile.setState({ results: next });
}

/** Le bilan de l'appareil, réactif. */
export function useRecord(): { wins: number; losses: number } {
  const results = useProfile((s) => s.results);
  return useMemo(() => tally(results), [results]);
}

/** Note l'issue de la partie dès que mon rang est connu (élimination ou fin), une fois par partie. */
export function useRecordOutcome(view: GameView | null): void {
  const gameId = view?.gameId;
  const outcome = isPlayerView(view) ? outcomeOf(myRank(view)) : null;
  useEffect(() => {
    if (gameId && outcome) recordResult(gameId, outcome);
  }, [gameId, outcome]);
}
