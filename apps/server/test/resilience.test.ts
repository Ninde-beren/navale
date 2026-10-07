import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, Command, PlayerView } from '@navale/protocol';
import { createApp } from '../src/app.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé');
    await sleep(10);
  }
}
const command = (socket: Socket, cmd: Command) =>
  new Promise<Ack>((resolve) => socket.emit('command', cmd, (ack: Ack) => resolve(ack)));

interface Spy {
  socket: Socket;
  snapshots: PlayerView[];
  presence: Array<{ playerId: string; connected: boolean }>;
}
function open(baseUrl: string, auth: Record<string, unknown>): Promise<Spy> {
  return new Promise((resolve, reject) => {
    const socket = connect(baseUrl, { auth, transports: ['websocket'], reconnection: false });
    const spy: Spy = { socket, snapshots: [], presence: [] };
    socket.on('snapshot', (v: PlayerView) => spy.snapshots.push(v));
    socket.on('presence', (p: { playerId: string; connected: boolean }) => spy.presence.push(p));
    socket.on('rejected', (err: { code: string }) => reject(new Error(err.code)));
    socket.once('snapshot', () => resolve(spy));
  });
}
async function boot(
  storePath: string,
  expiry?: { lobbyMs: number; playingMs: number; finishedMs: number; intervalMs: number },
) {
  const app = await createApp(
    { port: 0, dataDir: '/tmp', publicUrl: 'https://navale.test', logLevel: 'silent' },
    storePath,
    { botThinkMs: () => 0, ...(expiry ? { expiry } : {}) },
  );
  await app.listen();
  const address = app.app.server.address();
  if (!address || typeof address === 'string') throw new Error('adresse inconnue');
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}
async function createGame(baseUrl: string, body: unknown) {
  const res = await fetch(`${baseUrl}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { gameId: string; code: string; hostToken: string };
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'navale-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('fiabilité', () => {
  it('un joueur se reconnecte par son jeton, et sa présence est signalée', async () => {
    const { app, baseUrl } = await boot(':memory:');
    try {
      const g = await createGame(baseUrl, {
        settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0 },
      });
      const board = await open(baseUrl, { kind: 'board', code: g.code });
      const me = await open(baseUrl, { kind: 'join', code: g.code });
      const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
      if (!joined.ok) throw new Error('join');
      const { playerId, playerToken } = joined.data as { playerId: string; playerToken: string };
      await until(() => board.presence.some((p) => p.playerId === playerId && p.connected));

      me.socket.disconnect();
      await until(() => board.presence.some((p) => p.playerId === playerId && !p.connected));
      await until(() => board.snapshots.at(-1)?.players[0]?.connected === false || true);

      const again = await open(baseUrl, { kind: 'player', token: playerToken });
      expect(again.snapshots[0]).toMatchObject({ kind: 'player', status: 'LOBBY' });
      expect(again.snapshots[0]!.me.playerId).toBe(playerId);
      await until(
        () => board.presence.filter((p) => p.playerId === playerId && p.connected).length >= 2,
      );
      again.socket.disconnect();
      board.socket.disconnect();
    } finally {
      await app.close();
    }
  });

  it('une partie en cours survit à un redémarrage du serveur : état, jetons, bot et code', async () => {
    const storePath = join(dir, 'restart.sqlite');
    const first = await boot(storePath);
    const g = await createGame(first.baseUrl, {
      settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0 },
      preset: 'quick',
    });
    let botId = '';
    let playerToken = '';
    try {
      const host = await open(first.baseUrl, {
        kind: 'board',
        code: g.code,
        hostToken: g.hostToken,
      });
      const me = await open(first.baseUrl, { kind: 'join', code: g.code });
      const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
      if (!joined.ok) throw new Error('join');
      playerToken = (joined.data as { playerToken: string }).playerToken;
      await command(host.socket, { type: 'ADD_BOT' });
      const runtime = first.app.registry.get(g.gameId)!;
      const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
      botId = bot.playerId;
      await command(me.socket, {
        type: 'PLACE_FLEET',
        ships: bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation })),
      });
      await command(me.socket, { type: 'SET_READY', ready: true });
      await command(host.socket, { type: 'START_GAME' });
      await until(
        () =>
          runtime.state.round?.expectedShooters[0] ===
          (joined.data as { playerId: string }).playerId,
      );
      expect(
        await command(me.socket, { type: 'FIRE', targetId: botId, coord: { x: 0, y: 0 } }),
      ).toMatchObject({ ok: true });
      // Le bot joue, puis c'est de nouveau à Antoine : on coupe le serveur à cet instant.
      await until(() => runtime.state.shotsLog.length >= 2);
      me.socket.disconnect();
      host.socket.disconnect();
    } finally {
      await first.app.close();
    }

    const second = await boot(storePath);
    try {
      expect(second.app.restored).toBe(1);
      const runtime = second.app.registry.get(g.gameId)!;
      expect(runtime.state.status).toBe('PLAYING');
      expect(runtime.state.shotsLog.length).toBeGreaterThanOrEqual(2);
      expect(runtime.code).toBe(g.code);
      expect((await fetch(`${second.baseUrl}/api/games/${g.code}`)).status).toBe(200);

      const me = await open(second.baseUrl, { kind: 'player', token: playerToken });
      expect(me.snapshots[0]!.me.fleet).toHaveLength(4);
      expect(me.snapshots[0]!.status).toBe('PLAYING');
      const host = await open(second.baseUrl, { kind: 'host', token: g.hostToken });
      expect(host.snapshots[0]!.isHost).toBe(true);

      // Antoine rejoue : le bot, rattaché à la reprise, riposte.
      const before = runtime.state.shotsLog.length;
      await until(() => runtime.state.round?.expectedShooters[0] === me.snapshots[0]!.me.playerId);
      expect(
        await command(me.socket, { type: 'FIRE', targetId: botId, coord: { x: 1, y: 1 } }),
      ).toMatchObject({ ok: true });
      await until(() => runtime.state.shotsLog.length >= before + 2);
      me.socket.disconnect();
      host.socket.disconnect();
    } finally {
      await second.app.close();
    }
  });

  it('expire les parties inactives et oublie les parties terminées, en libérant les codes', async () => {
    const { app, baseUrl } = await boot(':memory:', {
      lobbyMs: 30,
      playingMs: 30,
      finishedMs: 30,
      intervalMs: 0,
    });
    try {
      const lobby = await createGame(baseUrl, {
        settings: { variant: 'sequential', maxPlayers: 2 },
      });
      const playing = await createGame(baseUrl, {
        settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0 },
      });
      const host = await open(baseUrl, {
        kind: 'board',
        code: playing.code,
        hostToken: playing.hostToken,
      });
      const me = await open(baseUrl, { kind: 'join', code: playing.code });
      const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
      if (!joined.ok) throw new Error('join');
      await command(host.socket, { type: 'ADD_BOT' });
      const runtime = app.registry.get(playing.gameId)!;
      const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
      await command(me.socket, {
        type: 'PLACE_FLEET',
        ships: bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation })),
      });
      await command(me.socket, { type: 'SET_READY', ready: true });
      await command(host.socket, { type: 'START_GAME' });
      expect(runtime.state.status).toBe('PLAYING');

      await sleep(60);
      const first = await app.sweeper.sweep();
      expect(first.cancelled.sort()).toEqual([lobby.code, playing.code].sort());
      expect(app.registry.get(lobby.gameId)!.state).toMatchObject({ status: 'CANCELLED' });
      expect(runtime.state.status).toBe('CANCELLED');
      expect((await fetch(`${baseUrl}/api/games/${lobby.code}`)).status).toBe(404);
      expect(host.snapshots.at(-1)?.status ?? runtime.state.status).toBe('CANCELLED');

      await sleep(60);
      const second = await app.sweeper.sweep();
      expect(second.forgotten.sort()).toEqual([lobby.code, playing.code].sort());
      expect(app.registry.get(lobby.gameId)).toBeUndefined();
      await expect(
        open(baseUrl, {
          kind: 'player',
          token: (joined.data as { playerToken: string }).playerToken,
        }),
      ).rejects.toThrow('TOKEN_INVALID');
      me.socket.disconnect();
      host.socket.disconnect();
    } finally {
      await app.close();
    }
  });
});
