import { describe, expect, it } from 'vitest';
import { botLevel } from '../src/battleship/bot/strategy.js';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { projectPrivate, projectPublic } from '../src/battleship/project.js';
import { rematchEvents } from '../src/battleship/rematch.js';
import { makeSettings } from '../src/battleship/settings.js';
import { HOST, Harness, SYSTEM, TINY_FLEET, player, startedGame, tinySettings } from './helpers.js';

const quick = (over = {}) =>
  makeSettings({ variant: 'sequential', maxPlayers: 2, ...over }, 'quick');

describe('joueur absent relayé par un bot', () => {
  it('le système ou l’hôte posent un relais au niveau des réglages ; le joueur reste lui-même', () => {
    const { h, ids } = startedGame(2, quick({ afkBotLevel: 'hard' }));
    const [a, j] = ids as [string, string];
    h.expectReject(player(a), { type: 'SUBSTITUTE_PLAYER', playerId: a }, 'NOT_HOST');
    expect(h.expectOk(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: a })).toEqual([
      { type: 'PLAYER_SUBSTITUTED', playerId: a, level: 'hard' },
    ]);
    expect(h.expectOk(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: a })).toEqual([]); // déjà relayé
    const me = projectPublic(h.state).players.find((p) => p.playerId === a)!;
    expect(me.kind).toBe('human');
    expect(me.substitute).toBe('hard');
    expect(botLevel(projectPrivate(h.state, a))).toBe('hard');

    // Le relais tire par la voie du joueur : le tir est le sien.
    expect(h.active).toBe(a);
    expect(h.types(h.fire(a, j, { x: 7, y: 7 }))).toContain('SHOT_RESOLVED');
    expect(h.state.shotsLog.at(-1)?.shooterId).toBe(a);

    // Retour : l'hôte peut aussi le demander ; sans relais en cours, rien ne se passe.
    expect(h.expectOk(HOST, { type: 'RESUME_PLAYER', playerId: a })).toEqual([
      { type: 'PLAYER_RESUMED', playerId: a },
    ]);
    expect(projectPublic(h.state).players[0]!.substitute).toBeNull();
    expect(h.expectOk(SYSTEM, { type: 'RESUME_PLAYER', playerId: a })).toEqual([]);
    expect(botLevel(projectPrivate(h.state, a))).toBe('normal');
  });

  it('refuse hors partie, pour un bot, un éliminé ou un inconnu', () => {
    const h = new Harness(tinySettings());
    const a = h.join('Antoine', 'red');
    const b = h.join('Julie', 'blue');
    h.expectOk(HOST, { type: 'ADD_BOT' });
    const bot = h.state.players.find((p) => p.kind === 'bot')!.playerId;
    h.expectReject(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: a }, 'GAME_NOT_PLAYING');
    for (const id of [a, b]) {
      h.place(id, TINY_FLEET);
      h.ready(id);
    }
    h.start();
    h.expectReject(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: bot }, 'WRONG_STATE');
    h.expectReject(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: 'nobody' }, 'PLAYER_UNKNOWN');
    h.expectReject(SYSTEM, { type: 'RESUME_PLAYER', playerId: 'nobody' }, 'PLAYER_UNKNOWN');

    // Antoine rate, puis Julie et le bot coulent son torpilleur : éliminé, il ne se relaie plus.
    h.fire(a, b, { x: 5, y: 5 });
    h.fire(b, a, { x: 0, y: 0 });
    h.fire(bot, a, { x: 1, y: 0 });
    expect(h.state.players.find((p) => p.playerId === a)?.status).toBe('ELIMINATED');
    expect(h.state.status).toBe('PLAYING');
    h.expectReject(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: a }, 'NOT_ALIVE');
  });

  it('la revanche repart sans relais', () => {
    const { h, ids } = startedGame(2, quick());
    h.expectOk(SYSTEM, { type: 'SUBSTITUTE_PLAYER', playerId: ids[0]! });
    let next = initialState({
      gameId: 'g2',
      code: 'ABCD',
      settings: h.state.settings,
      createdAt: 0,
    });
    for (const e of rematchEvents(h.state, 'g2', h.ctx(HOST))) next = evolve(next, e);
    expect(next.players).toHaveLength(2);
    expect(next.players.every((p) => p.substitute === null)).toBe(true);
  });
});
