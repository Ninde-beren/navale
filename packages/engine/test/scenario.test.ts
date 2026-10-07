import { describe, expect, it } from 'vitest';
import { randomGame } from './random-game.js';

/**
 * Démonstration du jalon M1 : une partie complète à trois joueurs, jouée en
 * console. `pnpm test -- scenario` pour la voir.
 */
describe('scénario', () => {
  it('joue une partie complète à 3 en tour par tour et l’affiche', () => {
    const h = randomGame(2026, 3, 'sequential');
    expect(h.state.status).toBe('FINISHED');
    const names = new Map(h.state.players.map((p) => [p.playerId, p.name]));
    const lines = [
      `Partie ${h.state.code} : ${h.state.players.length} joueurs, ${h.state.shotsLog.length} tirs, ` +
        `${h.events.filter((e) => e.type === 'ROUND_RESOLVED').length} manches`,
    ];
    for (const e of h.events) {
      if (e.type === 'SHOT_RESOLVED')
        lines.push(
          `  manche ${e.round} : ${names.get(e.shooterId)} → ${names.get(e.targetId)} ${String.fromCharCode(65 + e.coord.x)}${e.coord.y + 1} ${e.result}`,
        );
      if (e.type === 'PLAYER_ELIMINATED')
        lines.push(`  ${names.get(e.playerId)} est éliminé (${e.rank}e)`);
      if (e.type === 'GAME_FINISHED')
        lines.push(
          `Victoire de ${names.get(e.winnerId ?? '')}. Classement : ` +
            e.ranking
              .map(
                (r) =>
                  `${r.rank}. ${names.get(r.playerId)} (${r.hits}/${r.shotsFired}, ${r.shipsSunk} coulés)`,
              )
              .join(' · '),
        );
    }
    console.log(
      lines.length > 40
        ? [...lines.slice(0, 20), '  …', ...lines.slice(-6)].join('\n')
        : lines.join('\n'),
    );
    expect(h.state.ranking).toHaveLength(3);
  });
});
