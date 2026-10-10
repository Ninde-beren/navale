import type { PublicPlayer } from '@navale/protocol';

/**
 * Le ou les meilleurs fantômes : le plus de bons pronostics, puis le moins de manqués ;
 * personne tant qu'aucun pronostic n'a compté.
 */
export function bestGhosts(players: PublicPlayer[]): PublicPlayer[] {
  const ghosts = players.filter((p) => p.bets.total > 0);
  const score = (p: PublicPlayer) => [p.bets.won, p.bets.won - p.bets.total] as const;
  let best: PublicPlayer[] = [];
  for (const p of ghosts) {
    const [won, lost] = score(p);
    const [bestWon, bestLost] = best[0] ? score(best[0]) : [-1, -Infinity];
    if (won > bestWon || (won === bestWon && lost > bestLost)) best = [p];
    else if (won === bestWon && lost === bestLost) best.push(p);
  }
  return best;
}

/** Les joueurs par identifiant, et le nom à afficher (« ? » pour un joueur qui n'est plus là). */
export function playerLookup(players: PublicPlayer[]) {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  return { byId, nameOf: (playerId: string) => byId.get(playerId)?.name ?? '?' };
}
