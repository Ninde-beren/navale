import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { battleship } from '@navale/engine';
import type { CreateGameRequest } from '@navale/protocol';
import { installLastResort } from '../src/last-resort.js';
import {
  command,
  createGame,
  open,
  sleep,
  startServer,
  until,
  type TestServer,
} from './support.js';

/**
 * Une panne reste dans sa partie : une exception du moteur, d'une projection ou d'un
 * journal illisible est journalisée, la partie touchée en pâtit seule, le serveur continue.
 */

const realDecide = battleship.decide;
const realEvolve = battleship.evolve;
const realProjectPublic = battleship.projectPublic;
const failure = () => new Error('panne simulée');

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'navale-panne-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Les erreurs journalisées par le serveur pour cette partie. */
function errorsFor(
  spy: { mock: { calls: unknown[][] } },
  gameId: string,
): Record<string, unknown>[] {
  return spy.mock.calls
    .map(([context]) => context as Record<string, unknown>)
    .filter((context) => context.gameId === gameId);
}

/** Une partie lancée contre un bot, au moment où c'est au joueur humain de tirer. */
async function seatedGame(
  server: TestServer,
  baseUrl: string,
  settings: CreateGameRequest['settings'],
) {
  const g = await createGame(baseUrl, { settings, preset: 'quick' });
  const runtime = server.registry.get(g.gameId)!;
  const host = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
  const me = await open(baseUrl, { kind: 'join', code: g.code });
  const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
  if (!joined.ok) throw new Error('join');
  const myId = (joined.data as { playerId: string }).playerId;
  await command(host.socket, { type: 'ADD_BOT' });
  const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
  const ships = bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }));
  await command(me.socket, { type: 'PLACE_FLEET', ships });
  await command(me.socket, { type: 'SET_READY', ready: true });
  await command(host.socket, { type: 'START_GAME' });
  await until(() => runtime.state.round?.expectedShooters[0] === myId);
  return { g, runtime, host, me, botId: bot.playerId };
}

describe('une panne reste dans sa partie', () => {
  it('une exception du moteur refuse la commande et la journalise, les autres parties continuent', async () => {
    const { server, baseUrl } = await startServer();
    try {
      const error = vi.spyOn(server.app.log, 'error');
      const touched = await createGame(baseUrl);
      const other = await createGame(baseUrl);
      const decide = vi.spyOn(battleship, 'decide').mockImplementation((state, cmd, ctx) => {
        if (state.gameId === touched.gameId && cmd.type === 'JOIN_GAME') throw failure();
        return realDecide(state, cmd, ctx);
      });
      const inTouched = await open(baseUrl, { kind: 'join', code: touched.code });
      const inOther = await open(baseUrl, { kind: 'join', code: other.code });

      expect(
        await command(inTouched.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' }),
      ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
      expect(errorsFor(error, touched.gameId)).toContainEqual(
        expect.objectContaining({
          err: expect.any(Error),
          command: 'JOIN_GAME',
          actor: { kind: 'join' },
        }),
      );

      expect(
        await command(inOther.socket, { type: 'JOIN_GAME', name: 'Bea', color: 'blue' }),
      ).toMatchObject({ ok: true });
      // La file de la partie touchée n'est pas bloquée : elle reprend dès que le moteur répond.
      decide.mockRestore();
      expect(
        await command(inTouched.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' }),
      ).toMatchObject({ ok: true });
      inTouched.socket.disconnect();
      inOther.socket.disconnect();
    } finally {
      await server.close();
    }
  });

  it('une exception d’evolve laisse le journal et l’état intacts : la partie continue et se rejoue', async () => {
    const storePath = join(dir, 'evolve.sqlite');
    const first = await startServer({ storePath });
    const g = await createGame(first.baseUrl);
    let final: unknown;
    try {
      const runtime = first.server.registry.get(g.gameId)!;
      const before = runtime.state;
      const me = await open(first.baseUrl, { kind: 'join', code: g.code });
      const evolve = vi.spyOn(battleship, 'evolve').mockImplementation((state, event) => {
        if (event.type === 'PLAYER_JOINED') throw failure();
        return realEvolve(state, event);
      });
      expect(
        await command(me.socket, { type: 'JOIN_GAME', name: 'Bea', color: 'blue' }),
      ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
      expect(runtime.state).toBe(before);

      evolve.mockRestore();
      expect(
        await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' }),
      ).toMatchObject({ ok: true });
      final = runtime.state;
      me.socket.disconnect();
    } finally {
      await first.server.close();
    }

    // Le journal ne garde que ce que l'état a vraiment appliqué : il se rejoue à l'identique.
    const second = await startServer({ storePath });
    try {
      expect(second.server.restored).toBe(1);
      expect(second.server.registry.get(g.gameId)!.state).toEqual(final);
    } finally {
      await second.server.close();
    }
  });

  it('un journal qui ne se rejoue plus n’empêche pas le redémarrage : la partie est mise de côté', async () => {
    const storePath = join(dir, 'corrompu.sqlite');
    const first = await startServer({ storePath });
    const unreadable = await createGame(first.baseUrl);
    const unreplayable = await createGame(first.baseUrl);
    const healthy = await createGame(first.baseUrl);
    let joined = { playerId: '', playerToken: '' };
    try {
      const me = await open(first.baseUrl, { kind: 'join', code: healthy.code });
      const ack = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
      if (!ack.ok) throw new Error('join');
      joined = ack.data as typeof joined;
      me.socket.disconnect();
    } finally {
      await first.server.close();
    }

    // Un événement qui n'est plus du JSON, et un moteur qui ne sait plus rejouer un journal.
    const db = new DatabaseSync(storePath);
    db.prepare("UPDATE events SET payload = '{' WHERE game_id = ? AND seq = 1").run(
      unreadable.gameId,
    );
    db.close();
    const evolve = vi.spyOn(battleship, 'evolve').mockImplementation((state, event) => {
      if (state.gameId === unreplayable.gameId) throw failure();
      return realEvolve(state, event);
    });

    const second = await startServer({ storePath });
    try {
      expect(second.server.restored).toBe(1);
      expect([...second.server.broken].sort()).toEqual(
        [unreadable.gameId, unreplayable.gameId].sort(),
      );
      expect((await fetch(`${second.baseUrl}/api/games/${healthy.code}`)).status).toBe(200);
      expect((await fetch(`${second.baseUrl}/api/games/${unreadable.code}`)).status).toBe(404);
      const me = await open(second.baseUrl, { kind: 'player', token: joined.playerToken });
      expect(me.snapshots[0]!.me.playerId).toBe(joined.playerId);
      me.socket.disconnect();
    } finally {
      await second.server.close();
    }
    evolve.mockRestore();

    // Les journaux sont gardés tels quels ; les parties mises de côté ne sont plus retentées.
    const check = new DatabaseSync(storePath);
    const status = check.prepare('SELECT status FROM games WHERE game_id = ?');
    const events = check.prepare('SELECT COUNT(*) AS n FROM events WHERE game_id = ?');
    for (const g of [unreadable, unreplayable]) {
      expect(status.get(g.gameId)).toEqual({ status: 'BROKEN' });
      expect(events.get(g.gameId)).toEqual({ n: 1 });
    }
    check.close();
    const third = await startServer({ storePath });
    try {
      expect(third.server.restored).toBe(1);
      expect(third.server.broken).toEqual([]);
    } finally {
      await third.server.close();
    }
  });

  it('une projection qui lève pendant une commande : la commande passe, l’erreur est journalisée', async () => {
    const { server, baseUrl } = await startServer();
    try {
      const error = vi.spyOn(server.app.log, 'error');
      const g = await createGame(baseUrl);
      const board = await open(baseUrl, { kind: 'board', code: g.code });
      const me = await open(baseUrl, { kind: 'join', code: g.code });
      vi.spyOn(battleship, 'projectPublic').mockImplementation((state, presence) => {
        if (state.gameId === g.gameId) throw failure();
        return realProjectPublic(state, presence);
      });
      // Le joueur reçoit sa vue privée ; l'écran central, dont la vue publique lève, n'a rien.
      expect(
        await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' }),
      ).toMatchObject({ ok: true });
      expect(server.registry.get(g.gameId)!.state.players).toHaveLength(1);
      expect(errorsFor(error, g.gameId).length).toBeGreaterThan(0);
      // Une connexion qui ne peut pas recevoir son premier instantané est refusée proprement.
      await expect(open(baseUrl, { kind: 'board', code: g.code })).rejects.toThrow(
        'rejected:INTERNAL_ERROR',
      );
      me.socket.disconnect();
      board.socket.disconnect();
    } finally {
      await server.close();
    }
  });

  it('une projection qui lève dans la minuterie d’annonce ne coupe pas le serveur', async () => {
    const { server, baseUrl } = await startServer();
    try {
      const error = vi.spyOn(server.app.log, 'error');
      // Avec un délai d'annonce, l'instantané qui suit un tir part d'une minuterie.
      const game = await seatedGame(server, baseUrl, {
        variant: 'sequential',
        maxPlayers: 2,
        revealDelayMs: 50,
      });
      const project = vi
        .spyOn(battleship, 'projectPublic')
        .mockImplementation((state, presence) => {
          if (state.gameId === game.g.gameId) throw failure();
          return realProjectPublic(state, presence);
        });
      expect(
        await command(game.me.socket, {
          type: 'FIRE',
          targetId: game.botId,
          coord: { x: 0, y: 0 },
        }),
      ).toMatchObject({ ok: true });
      await until(() => errorsFor(error, game.g.gameId).length > 0);

      // La partie continue : le bot riposte, l'écran central reçoit de nouveau ses instantanés.
      project.mockRestore();
      const seen = game.host.snapshots.length;
      await until(() => game.runtime.state.shotsLog.length >= 2);
      await until(() => game.host.snapshots.length > seen);
      const other = await createGame(baseUrl);
      const p = await open(baseUrl, { kind: 'join', code: other.code });
      expect(
        await command(p.socket, { type: 'JOIN_GAME', name: 'Bea', color: 'blue' }),
      ).toMatchObject({ ok: true });
      p.socket.disconnect();
      game.me.socket.disconnect();
      game.host.socket.disconnect();
    } finally {
      await server.close();
    }
  });

  it('un tir de bot que le moteur fait échouer est journalisé, hors de toute requête', async () => {
    const { server, baseUrl } = await startServer();
    try {
      const error = vi.spyOn(server.app.log, 'error');
      const game = await seatedGame(server, baseUrl, {
        variant: 'sequential',
        maxPlayers: 2,
        revealDelayMs: 0,
      });
      vi.spyOn(battleship, 'decide').mockImplementation((state, cmd, ctx) => {
        if (ctx.actor.kind === 'player' && ctx.actor.playerId === game.botId) throw failure();
        return realDecide(state, cmd, ctx);
      });
      expect(
        await command(game.me.socket, {
          type: 'FIRE',
          targetId: game.botId,
          coord: { x: 0, y: 0 },
        }),
      ).toMatchObject({ ok: true });
      await until(() =>
        errorsFor(error, game.g.gameId).some((context) => context.playerId === game.botId),
      );
      const other = await createGame(baseUrl);
      const p = await open(baseUrl, { kind: 'join', code: other.code });
      expect(
        await command(p.socket, { type: 'JOIN_GAME', name: 'Bea', color: 'blue' }),
      ).toMatchObject({ ok: true });
      p.socket.disconnect();
      game.me.socket.disconnect();
      game.host.socket.disconnect();
    } finally {
      await server.close();
    }
  });

  it('une partie qui ne s’annule pas n’empêche pas d’expirer les autres', async () => {
    const { server, baseUrl } = await startServer({
      app: { expiry: { lobbyMs: 30, playingMs: 30, finishedMs: 30, intervalMs: 0 } },
    });
    try {
      const error = vi.spyOn(server.app.log, 'error');
      const stuck = await createGame(baseUrl);
      const idle = await createGame(baseUrl);
      vi.spyOn(battleship, 'decide').mockImplementation((state, cmd, ctx) => {
        if (state.gameId === stuck.gameId && cmd.type === 'CANCEL_GAME') throw failure();
        return realDecide(state, cmd, ctx);
      });
      await sleep(60);
      const swept = await server.sweeper.sweep();
      expect(swept.cancelled).toEqual([idle.code]);
      expect(server.registry.get(idle.gameId)!.state.status).toBe('CANCELLED');
      expect(server.registry.get(stuck.gameId)!.state.status).toBe('LOBBY');
      expect(errorsFor(error, stuck.gameId).length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });
});

describe('filet de dernier recours', () => {
  function install() {
    const proc = new EventEmitter();
    const log = { error: vi.fn(), fatal: vi.fn() };
    const shutdown = vi.fn();
    installLastResort(proc as unknown as NodeJS.Process, log, shutdown);
    return { proc, log, shutdown };
  }

  it('journalise une promesse rejetée sans gestionnaire, et le serveur continue', () => {
    const { proc, log, shutdown } = install();
    proc.emit('unhandledRejection', failure(), Promise.resolve());
    expect(log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, expect.any(String));
    expect(shutdown).not.toHaveBeenCalled();
  });

  it('journalise une exception non rattrapée et arrête le serveur en erreur, pour être relancé', () => {
    const { proc, log, shutdown } = install();
    proc.emit('uncaughtException', failure());
    expect(log.fatal).toHaveBeenCalledWith({ err: expect.any(Error) }, expect.any(String));
    expect(shutdown).toHaveBeenCalledWith(1);
  });
});
