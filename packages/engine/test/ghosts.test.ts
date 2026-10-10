import { describe, expect, it } from 'vitest';
import type { Bet, GameSettings } from '@navale/protocol';
import { chooseBet } from '../src/battleship/bot/strategy.js';
import {
  privateRecipient,
  projectPrivate,
  projectPublic,
  publicEvent,
} from '../src/battleship/project.js';
import { roundOutcome } from '../src/battleship/rules/ghosts.js';
import { normalizeSettings } from '../src/battleship/settings.js';
import { assertNoLeak } from './leak.js';
import {
  HOST,
  TINY_FLEET,
  player,
  startedGame,
  tinySettings,
  turn,
  type Harness,
} from './helpers.js';

/** Le pronostic d'un fantôme sur la manche en cours. */
const bet = (h: Harness, ghostId: string, outcome: Bet) =>
  h.expectOk(player(ghostId), { type: 'PLACE_BET', round: h.state.round!.index, bet: outcome });

/** Trois joueurs, torpilleur de deux cases : Antoine coule Julie à la quatrième manche. */
function withGhost(over: Partial<GameSettings> = {}) {
  const { h, ids } = startedGame(3, tinySettings(over), TINY_FLEET);
  const [a, j, m] = ids as [string, string, string];
  turn(h, j, { x: 0, y: 0 }); // Antoine touche Julie
  turn(h, m, { x: 5, y: 5 }); // Julie rate Marc
  turn(h, a, { x: 5, y: 5 }); // Marc rate Antoine
  turn(h, j, { x: 1, y: 0 }); // Antoine coule Julie : elle devient fantôme
  return { h, a, j, m };
}

describe('fantômes : les pronostics', () => {
  it('un éliminé pronostique la manche, réglé après ses tirs', () => {
    const { h, a, j, m } = withGhost();
    expect(projectPrivate(h.state, j).me).toMatchObject({ canBet: true, bet: null });
    bet(h, j, 'HIT');
    expect(projectPrivate(h.state, j).me.bet).toBe('HIT');
    const events = turn(h, a, { x: 4, y: 4 }); // Marc rate Antoine
    expect(h.types(events)).toEqual([
      'SHOT_RESOLVED',
      'BETS_SETTLED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    expect(events[1]).toMatchObject({ outcome: 'MISS', bets: [{ playerId: j, bet: 'HIT' }] });
    expect(projectPublic(h.state).players.find((p) => p.playerId === j)?.bets).toEqual({
      won: 0,
      total: 1,
    });
    // Nouvelle manche : le pronostic repart de zéro.
    expect(projectPrivate(h.state, j).me.bet).toBeNull();
    bet(h, j, 'HIT');
    turn(h, m, { x: 0, y: 0 }); // Antoine touche Marc
    expect(h.state.players.find((p) => p.playerId === j)?.bets).toEqual({ won: 1, total: 2 });
  });

  it('se change jusqu’à la résolution, et le même pronostic deux fois ne change rien', () => {
    const { h, a, j } = withGhost();
    bet(h, j, 'HIT');
    expect(bet(h, j, 'MISS')).toHaveLength(1);
    expect(bet(h, j, 'MISS')).toHaveLength(0);
    const settled = turn(h, a, { x: 4, y: 4 }).find((e) => e.type === 'BETS_SETTLED');
    expect(settled).toMatchObject({ outcome: 'MISS', bets: [{ playerId: j, bet: 'MISS' }] });
  });

  it('un pronostic parti pour une manche déjà jouée est refusé', () => {
    const { h, j } = withGhost();
    const round = h.state.round!.index;
    h.expectReject(player(j), { type: 'PLACE_BET', round: round - 1, bet: 'HIT' }, 'WRONG_STATE');
  });

  it('une manche sans tir ne compte pas', () => {
    const { h, j } = withGhost();
    bet(h, j, 'MISS');
    const settled = h
      .expectOk(HOST, { type: 'FORCE_ROUND' })
      .find((e) => e.type === 'BETS_SETTLED');
    expect(settled).toMatchObject({ outcome: null });
    expect(h.state.players.find((p) => p.playerId === j)?.bets).toEqual({ won: 0, total: 0 });
  });

  it('réservé aux éliminés d’une partie à fantômes', () => {
    const { h, a } = withGhost();
    h.expectReject(
      player(a),
      { type: 'PLACE_BET', round: h.state.round!.index, bet: 'HIT' },
      'NOT_A_GHOST',
    );
    expect(projectPrivate(h.state, a).me.canBet).toBe(false);
    const spectators = withGhost({ eliminated: 'spectators' });
    spectators.h.expectReject(
      player(spectators.j),
      { type: 'PLACE_BET', round: spectators.h.state.round!.index, bet: 'HIT' },
      'NOT_A_GHOST',
    );
    expect(projectPrivate(spectators.h.state, spectators.j).me.canBet).toBe(false);
  });

  it('le pronostic reste secret jusqu’à la résolution', () => {
    const { h, a, j, m } = withGhost();
    const [placed] = bet(h, j, 'HIT');
    expect(privateRecipient(placed!)).toBe(j);
    expect(publicEvent(placed!)).not.toHaveProperty('bet');
    expect(JSON.stringify(projectPrivate(h.state, m))).not.toContain('"bet":"HIT"');
    expect(JSON.stringify(projectPublic(h.state))).not.toContain('"bet":"HIT"');
    assertNoLeak(h.state);
    const settled = turn(h, a, { x: 4, y: 4 }).find((e) => e.type === 'BETS_SETTLED');
    expect(privateRecipient(settled!)).toBeNull();
  });

  it('en salve, au moins un touché dans la manche', () => {
    const { h, ids } = startedGame(3, tinySettings({ variant: 'simultaneous' }), TINY_FLEET);
    const [a, j, m] = ids as [string, string, string];
    const salvo = (shots: Array<[string, string, number, number]>) =>
      shots.flatMap(([from, to, x, y]) => h.fire(from, to, { x, y }));
    salvo([
      [a, j, 0, 0],
      [j, m, 5, 5],
      [m, a, 5, 5],
    ]);
    salvo([
      [a, j, 1, 0], // Julie coulée
      [j, m, 4, 4],
      [m, a, 4, 4],
    ]);
    bet(h, j, 'MISS');
    const events = salvo([
      [a, m, 0, 0], // touché
      [m, a, 3, 3], // raté
    ]);
    expect(events.find((e) => e.type === 'BETS_SETTLED')).toMatchObject({ outcome: 'HIT' });
    expect(h.state.players.find((p) => p.playerId === j)?.bets).toEqual({ won: 0, total: 1 });
  });

  it('ce que la manche a donné : un touché suffit, un tir bloqué est un raté', () => {
    expect(roundOutcome([])).toBeNull();
    expect(roundOutcome([{ result: 'MISS' }, { result: 'BLOCKED' }])).toBe('MISS');
    expect(roundOutcome([{ result: 'MISS' }, { result: 'SUNK' }])).toBe('HIT');
  });

  it('le bot fantôme parie touché quand le tireur a une touche à achever', () => {
    const { h, a, j, m } = withGhost();
    // Marc tire, Antoine n'a rien de touché : l'eau est plus probable.
    expect(chooseBet(projectPrivate(h.state, j))).toBe('MISS');
    turn(h, a, { x: 4, y: 4 }); // Marc rate Antoine
    turn(h, m, { x: 0, y: 0 }); // Antoine touche Marc
    turn(h, a, { x: 3, y: 3 }); // Marc rate Antoine
    // Antoine tire, Marc a une touche à achever.
    expect(h.active).toBe(a);
    expect(chooseBet(projectPrivate(h.state, j))).toBe('HIT');
  });

  it('une partie journalisée avant les fantômes garde ses spectateurs', () => {
    const { eliminated: _e, ...old } = tinySettings();
    expect(normalizeSettings(old as GameSettings).eliminated).toBe('spectators');
    expect(tinySettings().eliminated).toBe('ghosts');
  });
});
