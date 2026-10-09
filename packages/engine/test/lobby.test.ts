const quick = () => makeSettings({ variant: 'sequential', maxPlayers: 3 }, 'quick');
import { describe, expect, it } from 'vitest';
import { botLevel } from '../src/battleship/bot/strategy.js';
import { projectPrivate, projectPublic } from '../src/battleship/project.js';
import type { Command } from '@navale/protocol';
import { HOST_COMMANDS } from '../src/battleship/decide.js';
import { evolve } from '../src/battleship/evolve.js';
import { makeSettings } from '../src/battleship/settings.js';
import { FIXED_QUICK, Harness, HOST, JOIN, player, SYSTEM } from './helpers.js';

describe('lobby', () => {
  it('fait rejoindre, attribue les sièges dans l’ordre, refuse pseudo et couleur pris', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    const j = h.join('Julie', 'yellow');
    expect(h.state.players.map((p) => [p.playerId, p.seat, p.status])).toEqual([
      [a, 0, 'PLACING'],
      [j, 1, 'PLACING'],
    ]);
    h.expectReject(JOIN, { type: 'JOIN_GAME', name: ' antoine ', color: 'blue' }, 'NAME_TAKEN');
    h.expectReject(JOIN, { type: 'JOIN_GAME', name: 'Marc', color: 'red' }, 'COLOR_TAKEN');
    h.expectReject(player(a), { type: 'JOIN_GAME', name: 'Marc', color: 'blue' }, 'WRONG_STATE');
  });

  it('refuse quand la partie est pleine ou déjà lancée', () => {
    const h = new Harness(quick());
    const ids = [h.join('A1', 'red'), h.join('B2', 'yellow'), h.join('C3', 'blue')];
    h.expectReject(JOIN, { type: 'JOIN_GAME', name: 'D4', color: 'purple' }, 'GAME_FULL');
    for (const id of ids) {
      h.place(id, FIXED_QUICK);
      h.ready(id);
    }
    h.start();
    h.expectReject(JOIN, { type: 'JOIN_GAME', name: 'D4', color: 'purple' }, 'GAME_NOT_JOINABLE');
  });

  it('exige une flotte pour être prêt, et le retour en placement avant de la changer', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    h.expectReject(player(a), { type: 'SET_READY', ready: true }, 'FLEET_MISSING');
    h.place(a, FIXED_QUICK);
    h.ready(a);
    expect(h.state.players[0]!.status).toBe('READY');
    h.expectReject(player(a), { type: 'PLACE_FLEET', ships: FIXED_QUICK }, 'WRONG_STATE');
    h.ready(a, false);
    h.place(a, FIXED_QUICK);
    expect(h.expectOk(player(a), { type: 'SET_READY', ready: false })).toEqual([]);
  });

  it('refuse une flotte invalide avec le détail', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    const d = h.run(player(a), { type: 'PLACE_FLEET', ships: FIXED_QUICK.slice(1) });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.rejection.code).toBe('FLEET_INVALID');
      expect(d.rejection.details).toEqual([
        expect.objectContaining({ reason: 'WRONG_COMPOSITION' }),
      ]);
    }
  });

  it('ne lance qu’avec au moins deux joueurs, tous prêts, et seulement l’hôte', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    h.expectReject(HOST, { type: 'START_GAME' }, 'NOT_ENOUGH_PLAYERS');
    const j = h.join('Julie', 'yellow');
    h.place(a, FIXED_QUICK);
    h.ready(a);
    const d = h.run(HOST, { type: 'START_GAME' });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.rejection.code).toBe('PLAYERS_NOT_READY');
      expect(d.rejection.details).toEqual({ players: [j] });
    }
    h.place(j, FIXED_QUICK);
    h.ready(j);
    h.expectReject(player(a), { type: 'START_GAME' }, 'NOT_HOST');
    const events = h.start();
    expect(h.types(events)).toEqual(['GAME_STARTED', 'ROUND_STARTED']);
    expect(h.state.status).toBe('PLAYING');
    expect(h.state.players.every((p) => p.status === 'ALIVE')).toBe(true);
    expect(h.state.round).toMatchObject({ index: 0, expectedShooters: [a] });
    h.expectReject(HOST, { type: 'START_GAME' }, 'WRONG_STATE');
  });

  it('permet de quitter, d’être exclu, de changer de profil', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    const j = h.join('Julie', 'yellow');
    h.expectOk(player(a), { type: 'UPDATE_PROFILE', name: 'Toine', color: 'blue' });
    expect(h.state.players[0]).toMatchObject({ name: 'Toine', color: 'blue' });
    h.expectReject(player(a), { type: 'UPDATE_PROFILE', name: 'julie' }, 'NAME_TAKEN');
    h.expectReject(player(a), { type: 'KICK_PLAYER', playerId: j }, 'NOT_HOST');
    h.expectOk(HOST, { type: 'KICK_PLAYER', playerId: j });
    h.expectOk(player(a), { type: 'LEAVE_GAME' });
    expect(h.state.players).toEqual([]);
    const m = h.join('Marc', 'green');
    expect(h.state.players[0]!.seat).toBe(0);
    h.expectReject(HOST, { type: 'KICK_PLAYER', playerId: 'nobody' }, 'PLAYER_UNKNOWN');
    h.expectOk(HOST, { type: 'CANCEL_GAME' });
    expect(h.state.status).toBe('CANCELLED');
    h.expectReject(player(m), { type: 'LEAVE_GAME' }, 'WRONG_STATE');
  });

  it('ajoute des bots prêts, flotte placée, et protège le dernier humain', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    h.expectReject(player(a), { type: 'ADD_BOT' }, 'NOT_HOST');
    const events = h.expectOk(HOST, { type: 'ADD_BOT' });
    expect(h.types(events)).toEqual(['PLAYER_JOINED', 'FLEET_PLACED', 'PLAYER_READY_CHANGED']);
    const bot = h.state.players[1]!;
    expect(bot).toMatchObject({ kind: 'bot', name: 'Corsaire', status: 'READY', seat: 1 });
    expect(bot.fleet).toHaveLength(4);
    expect(bot.color).not.toBe('red');
    h.expectOk(HOST, { type: 'ADD_BOT' });
    expect(h.state.players[2]!.name).toBe('Amiral');
    h.expectReject(HOST, { type: 'ADD_BOT' }, 'GAME_FULL');
    h.expectReject(player(a), { type: 'LEAVE_GAME' }, 'LAST_HUMAN');
    h.expectReject(HOST, { type: 'KICK_PLAYER', playerId: a }, 'LAST_HUMAN');
    h.expectReject(HOST, { type: 'REMOVE_BOT', playerId: a }, 'NOT_A_BOT');
    h.expectOk(HOST, { type: 'REMOVE_BOT', playerId: bot.playerId });
    expect(h.state.players.map((p) => p.name)).toEqual(['Antoine', 'Amiral']);
    h.place(a, FIXED_QUICK);
    h.ready(a);
    h.start();
    expect(h.state.status).toBe('PLAYING');
  });

  it('donne au bot le niveau choisi, normal par défaut, visible dans les vues', () => {
    const h = new Harness(quick());
    h.join('Antoine', 'red');
    const [joined] = h.expectOk(HOST, { type: 'ADD_BOT', level: 'hard' });
    expect(joined).toMatchObject({ type: 'PLAYER_JOINED', kind: 'bot', level: 'hard' });
    const [plain] = h.expectOk(HOST, { type: 'ADD_BOT' });
    expect(plain).toMatchObject({ type: 'PLAYER_JOINED', kind: 'bot', level: 'normal' });
    const [, hard, normal] = h.state.players;
    expect(hard?.level).toBe('hard');
    expect(normal?.level).toBe('normal');
    const pub = projectPublic(h.state);
    expect(pub.players.map((p) => p.level)).toEqual([undefined, 'hard', 'normal']);
    expect(botLevel(projectPrivate(h.state, hard!.playerId))).toBe('hard');
  });

  it('refuse une partie sans aucun humain et limite les bots à maxPlayers - 1', () => {
    const h = new Harness(makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'quick'));
    h.expectOk(HOST, { type: 'ADD_BOT' });
    h.expectReject(HOST, { type: 'ADD_BOT' }, 'GAME_FULL');
    h.expectReject(HOST, { type: 'START_GAME' }, 'NOT_ENOUGH_PLAYERS');
  });
});

describe('rôles', () => {
  it('réserve à l’hôte exactement les commandes de HOST_COMMANDS', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    const hostOnly: Command[] = [
      { type: 'KICK_PLAYER', playerId: a },
      { type: 'ADD_BOT' },
      { type: 'REMOVE_BOT', playerId: a },
      { type: 'START_GAME' },
      { type: 'FORCE_ROUND' },
      { type: 'CANCEL_GAME' },
      { type: 'REMATCH' },
    ];
    expect(hostOnly.map((c) => c.type).sort()).toEqual([...HOST_COMMANDS].sort());
    for (const command of hostOnly) h.expectReject(player(a), command, 'NOT_HOST');
  });

  it('laisse le système forcer la manche et annuler, et rien d’autre', () => {
    const h = new Harness(quick());
    h.expectReject(SYSTEM, { type: 'START_GAME' }, 'NOT_HOST');
    h.expectReject(SYSTEM, { type: 'FORCE_ROUND' }, 'GAME_NOT_PLAYING');
    expect(h.expectOk(SYSTEM, { type: 'CANCEL_GAME' })).toEqual([
      { type: 'GAME_CANCELLED', reason: 'expired' },
    ]);
  });

  it('refuse à un joueur de rejoindre une seconde fois', () => {
    const h = new Harness(quick());
    const a = h.join('Antoine', 'red');
    const d = h.run(player(a), { type: 'JOIN_GAME', name: 'Marc', color: 'blue' });
    expect(d).toMatchObject({ ok: false, rejection: { message: 'Tu es déjà dans la partie.' } });
  });
});

describe('lancement', () => {
  it('dit dans la vue ce qui empêche encore de lancer', () => {
    const h = new Harness(quick());
    const blocker = () => projectPublic(h.state).startBlocker;
    expect(blocker()).toBe('NOT_ENOUGH_PLAYERS');
    const ids = [h.join('Antoine', 'red'), h.join('Julie', 'yellow')];
    expect(blocker()).toBe('PLAYERS_NOT_READY');
    for (const id of ids) {
      h.place(id, FIXED_QUICK);
      h.ready(id);
    }
    expect(blocker()).toBeNull();
    h.start();
    expect(blocker()).toBeNull();
  });

  it('refuse de lancer une table sans humain', () => {
    // Inatteignable par les commandes (un bot laisse toujours une place à un humain) : on écrit le journal.
    const h = new Harness(quick());
    for (const [seat, playerId] of ['b1', 'b2'].entries()) {
      h.state = evolve(h.state, {
        type: 'PLAYER_JOINED',
        playerId,
        name: playerId,
        color: seat === 0 ? 'red' : 'blue',
        seat,
        kind: 'bot',
      });
      h.state = evolve(h.state, { type: 'PLAYER_READY_CHANGED', playerId, ready: true });
    }
    expect(projectPublic(h.state).startBlocker).toBe('NO_HUMAN');
    h.expectReject(HOST, { type: 'START_GAME' }, 'NOT_ENOUGH_PLAYERS');
  });
});
