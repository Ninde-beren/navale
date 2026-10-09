/** Antoine, Julie et un bot ; Antoine coule Julie en deux tirs, la partie s'arrête à la première flotte coulée. */
function finishedWithBot() {
  const h = new Harness(tinySettings({ endCondition: 'first_fleet_sunk' }));
  const a = h.join('Antoine', 'red');
  h.place(a, TINY_FLEET);
  h.ready(a);
  const j = h.join('Julie', 'yellow');
  h.place(j, TINY_FLEET);
  h.ready(j);
  const added = h.expectOk(HOST, { type: 'ADD_BOT' })[0];
  if (added?.type !== 'PLAYER_JOINED') throw new Error('bot attendu');
  const bot = added.playerId;
  h.start();
  h.fire(a, j, { x: 0, y: 0 });
  h.fire(j, a, { x: 5, y: 5 });
  h.fire(bot, a, { x: 5, y: 4 });
  h.fire(a, j, { x: 1, y: 0 });
  expect(h.state.status).toBe('FINISHED');
  return { h, a, j, bot };
}
import { describe, expect, it } from 'vitest';
import { rematchEvents } from '../src/battleship/rematch.js';
import { mulberry32 } from '../src/core/random.js';
import { makeSettings } from '../src/battleship/settings.js';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { validateFleet } from '../src/battleship/placement.js';
import { Harness, HOST, player, startedGame, SYSTEM, TINY_FLEET, tinySettings } from './helpers.js';

describe('revanche', () => {
  it('seul l’hôte relance, seulement une partie terminée, et une seule fois', () => {
    const playing = startedGame(2);
    playing.h.expectReject(HOST, { type: 'REMATCH' }, 'WRONG_STATE');

    const { h, a } = finishedWithBot();
    h.expectReject(player(a), { type: 'REMATCH' }, 'NOT_HOST');
    const events = h.expectOk(HOST, { type: 'REMATCH' });
    expect(events).toHaveLength(1);
    const created = events[0];
    if (created?.type !== 'REMATCH_CREATED') throw new Error('REMATCH_CREATED attendu');
    expect(created.code).toBe(h.state.code);
    expect(h.state.status).toBe('FINISHED');
    expect(h.state.rematchGameId).toBe(created.newGameId);
    h.expectReject(HOST, { type: 'REMATCH' }, 'WRONG_STATE');
  });

  it('garde le niveau de chaque bot dans le journal de la revanche', () => {
    const h = new Harness(makeSettings({ variant: 'sequential', maxPlayers: 3 }, 'quick'));
    h.join('Antoine', 'red');
    h.expectOk(HOST, { type: 'ADD_BOT', level: 'easy' });
    const events = rematchEvents(h.state, 'g2', {
      actor: HOST,
      now: 0,
      newId: () => 'x',
      random: mulberry32(1),
    });
    const bot = events.find((e) => e.type === 'PLAYER_JOINED' && e.kind === 'bot');
    expect(bot).toMatchObject({ level: 'easy' });
  });

  it('ouvre une nouvelle partie au même code : mêmes joueurs en placement, bots prêts', () => {
    const { h, a, j, bot } = finishedWithBot();
    const events = rematchEvents(h.state, 'g2', h.ctx(SYSTEM));
    expect(events.map((e) => e.type)).toEqual([
      'GAME_CREATED',
      'PLAYER_JOINED',
      'PLAYER_JOINED',
      'PLAYER_JOINED',
      'FLEET_PLACED',
      'PLAYER_READY_CHANGED',
    ]);
    const created = events[0];
    if (created?.type !== 'GAME_CREATED') throw new Error('GAME_CREATED attendu');
    let next = initialState({
      gameId: created.gameId,
      code: created.code,
      settings: created.settings,
      createdAt: created.createdAt,
    });
    for (const e of events) next = evolve(next, e);

    expect(next.gameId).toBe('g2');
    expect(next.code).toBe(h.state.code);
    expect(next.settings).toEqual(h.state.settings);
    expect(next.status).toBe('LOBBY');
    expect(next.round).toBeNull();
    expect(next.shotsLog).toEqual([]);
    expect(next.ranking).toBeNull();
    expect(next.players.map((p) => [p.playerId, p.name, p.color, p.seat, p.kind])).toEqual(
      h.state.players.map((p) => [p.playerId, p.name, p.color, p.seat, p.kind]),
    );
    for (const id of [a, j]) {
      const p = next.players.find((x) => x.playerId === id)!;
      expect(p.status).toBe('PLACING');
      expect(p.fleet).toEqual([]);
      expect(p.shotsReceived).toEqual([]);
      expect(p.rank).toBeNull();
    }
    const b = next.players.find((x) => x.playerId === bot)!;
    expect(b.status).toBe('READY');
    expect(b.fleet.every((s) => s.hits.length === 0)).toBe(true);
    expect(
      validateFleet(
        next.settings,
        b.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation })),
      ).ok,
    ).toBe(true);

    // La revanche se joue comme une partie neuve : les humains replacent, l'hôte relance.
    const h2 = new Harness(next.settings);
    h2.state = next;
    h2.expectReject(HOST, { type: 'START_GAME' }, 'PLAYERS_NOT_READY');
    for (const id of [a, j]) {
      h2.place(id, TINY_FLEET);
      h2.ready(id);
    }
    h2.start();
    expect(h2.state.status).toBe('PLAYING');
    expect(h2.state.round?.expectedShooters).toEqual([a]);
  });
});
