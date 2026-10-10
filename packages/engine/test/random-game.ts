import { mulberry32, pick, randomInt } from '../src/core/random.js';
import { randomFleet } from '../src/battleship/placement.js';
import { makeSettings } from '../src/battleship/settings.js';
import { coordKey } from '../src/battleship/state.js';
import { legalTargets } from '../src/battleship/rules/targets.js';
import { chooseGhostCard } from '../src/battleship/bot/strategy.js';
import { projectPrivate } from '../src/battleship/project.js';
import { COLORS, HOST, Harness, player } from './helpers.js';

/** Joue une partie entière avec des tirs légaux au hasard. Renvoie le banc d'essai. */
export function randomGame(
  seed: number,
  players: number,
  variant: 'sequential' | 'simultaneous',
  maxCommands = 2000,
): Harness {
  const settings = makeSettings(
    { variant, maxPlayers: players },
    players <= 2 ? 'classic' : 'quick',
  );
  const h = new Harness(settings, seed);
  const rnd = mulberry32(seed * 7919);
  const ids: string[] = [];
  for (let i = 0; i < players; i++) {
    const id = h.join(`J${i}`, COLORS[i]!);
    h.place(id, randomFleet(settings, rnd));
    h.ready(id);
    ids.push(id);
  }
  h.start();
  let commands = 0;
  while (h.state.status === 'PLAYING' && commands++ < maxCommands) {
    const round = h.state.round!;
    // Les fantômes pronostiquent et jouent leurs cartes au hasard : paris, barrages et cases
    // éclairées passent aussi par le rejeu et les vues.
    for (const p of h.state.players) {
      if (p.status !== 'ELIMINATED') continue;
      if (rnd() < 0.7)
        h.expectOk(player(p.playerId), {
          type: 'PLACE_BET',
          round: round.index,
          bet: rnd() < 0.5 ? 'HIT' : 'MISS',
        });
      const view = projectPrivate(h.state, p.playerId);
      if (view.me.ghostCards.length > 0 && rnd() < 0.5) {
        const play = chooseGhostCard(view, rnd);
        if (play)
          h.expectOk(player(p.playerId), { type: 'PLAY_GHOST_CARD', round: round.index, ...play });
      }
    }
    const shooter = round.expectedShooters.find((id) => !round.committed[id]);
    if (!shooter) {
      h.expectOk(HOST, { type: 'FORCE_ROUND' });
      continue;
    }
    const targets = legalTargets(h.state, shooter);
    const targetId = pick(rnd, targets);
    const target = h.state.players.find((p) => p.playerId === targetId)!;
    const taken = new Set(target.shotsReceived.map((s) => coordKey(s.coord)));
    const free: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < settings.grid.height; y++)
      for (let x = 0; x < settings.grid.width; x++)
        if (!taken.has(coordKey({ x, y }))) free.push({ x, y });
    const coord = free[randomInt(rnd, free.length)]!;
    h.fire(shooter, target.playerId, coord);
  }
  return h;
}
