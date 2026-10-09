import type { PublicPlayer } from '@navale/protocol';

/** Les joueurs par identifiant, et le nom à afficher (« ? » pour un joueur qui n'est plus là). */
export function playerLookup(players: PublicPlayer[]) {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  return { byId, nameOf: (playerId: string) => byId.get(playerId)?.name ?? '?' };
}
