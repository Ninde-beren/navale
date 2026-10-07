import { expect } from 'vitest';
import { projectPublic } from '../src/battleship/project.js';
import { coordKey, isSunk, type GameState } from '../src/battleship/state.js';

/** Aucune coordonnée d'une case de bateau non révélée ne doit apparaître dans la vue publique d'un joueur. */
export function assertNoLeak(state: GameState): void {
  const view = projectPublic(state);
  for (const p of state.players) {
    const pub = view.players.find((v) => v.playerId === p.playerId)!;
    const text = JSON.stringify(pub);
    expect(text).not.toContain('"fleet"');
    const revealed = new Set(p.shotsReceived.map((s) => coordKey(s.coord)));
    for (const ship of p.fleet) {
      if (isSunk(ship)) continue;
      for (const c of ship.cells) {
        if (revealed.has(coordKey(c))) continue;
        expect(text, `fuite de la case ${coordKey(c)} de ${p.name}`).not.toContain(
          `"x":${c.x},"y":${c.y}`,
        );
      }
    }
  }
}
