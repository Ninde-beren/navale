import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColorId, GameView } from '@navale/protocol';
import { myRank, outcomeOf, tally, withResult, type Outcome, type Results } from './record.js';
import { isPlayerView } from './store.js';

interface Profile {
  /** Dernier pseudo saisi, proposé au prochain « Rejoindre ». */
  name: string;
  /** Dernière couleur choisie, proposée au prochain « Rejoindre » si elle est libre ; absente des profils d'avant. */
  color?: ColorId | null;
  results: Results;
}

/**
 * Ce que l'appareil retient du joueur : son pseudo, sa couleur et son bilan, dans
 * `localStorage`. Jamais envoyé au serveur ; sans stockage (navigation privée…), ça vit
 * jusqu'au rechargement.
 */
export const useProfile = create<Profile>()(
  persist((): Profile => ({ name: '', color: null, results: {} }), { name: 'navale.profile' }),
);

/** Retient le pseudo et la couleur avec lesquels on vient de rejoindre. */
export function rememberPlayer(name: string, color: ColorId): void {
  const current = useProfile.getState();
  if (name !== current.name || color !== current.color) useProfile.setState({ name, color });
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
