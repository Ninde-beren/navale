/*
 * Le bilan du joueur sur son appareil : l'issue de chaque partie, par identifiant
 * de partie, et les comptes qu'on en tire. Fonctions pures ; le stockage est dans
 * `profile.ts`.
 */

export type Outcome = 'win' | 'loss';
/** Issue de chaque partie jouée depuis cet appareil, par identifiant de partie. */
export type Results = Record<string, Outcome>;

/** Issue d'une partie d'après le rang final : rien tant que le joueur est encore en lice. */
export function outcomeOf(rank: number | null | undefined): Outcome | null {
  if (rank === null || rank === undefined) return null;
  return rank === 1 ? 'win' : 'loss';
}

/** Mon rang dans la vue : posé sur le joueur dès son élimination, sinon dans le classement final. */
export function myRank(view: {
  players: ReadonlyArray<{ playerId: string; rank: number | null }>;
  ranking: ReadonlyArray<{ playerId: string; rank: number }> | null;
  me: { playerId: string };
}): number | null {
  const id = view.me.playerId;
  return (
    view.players.find((p) => p.playerId === id)?.rank ??
    view.ranking?.find((r) => r.playerId === id)?.rank ??
    null
  );
}

/** Les résultats avec celui-ci ; le même objet si rien ne change (une partie ne compte qu'une fois). */
export function withResult(results: Results, gameId: string, outcome: Outcome): Results {
  return results[gameId] === outcome ? results : { ...results, [gameId]: outcome };
}

export function tally(results: Results): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const outcome of Object.values(results)) {
    if (outcome === 'win') wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

/** « 3 victoires · 1 défaite », ou rien tant qu'aucune partie n'est jouée. */
export function recordLabel({ wins, losses }: { wins: number; losses: number }): string | null {
  if (wins + losses === 0) return null;
  const count = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  return `${count(wins, 'victoire')} · ${count(losses, 'défaite')}`;
}
