import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, Command, PlayerView } from '@navale/protocol';
import { createApp } from '../src/app.js';

let server: Awaited<ReturnType<typeof createApp>>;
let baseUrl: string;

interface Spy {
  socket: Socket;
  snapshots: PlayerView[];
  rematches: Array<{ gameId: string; code: string }>;
}
function open(auth: Record<string, unknown>): Promise<Spy> {
  return new Promise((resolve, reject) => {
    const socket = connect(baseUrl, { auth, transports: ['websocket'], reconnection: false });
    const spy: Spy = { socket, snapshots: [], rematches: [] };
    socket.on('snapshot', (v: PlayerView) => spy.snapshots.push(v));
    socket.on('rematch', (r: { gameId: string; code: string }) => spy.rematches.push(r));
    socket.on('rejected', (err: { code: string }) => reject(new Error(err.code)));
    socket.once('snapshot', () => resolve(spy));
  });
}
const command = (socket: Socket, cmd: Command) =>
  new Promise<Ack>((resolve) => socket.emit('command', cmd, (ack: Ack) => resolve(ack)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé');
    await sleep(10);
  }
}
const last = (spy: Spy) => spy.snapshots[spy.snapshots.length - 1]!;

beforeAll(async () => {
  server = await createApp(
    { port: 0, dataDir: '/tmp', publicUrl: 'https://navale.test', logLevel: 'silent' },
    ':memory:',
    { botThinkMs: () => 0 },
  );
  await server.listen();
  const address = server.app.server.address();
  if (!address || typeof address === 'string') throw new Error('adresse inconnue');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await server.close();
});

describe('revanche', () => {
  it('relance au même code avec les mêmes jetons, humains en placement, bot prêt', async () => {
    // Partie minuscule : un torpilleur de 2 cases sur 6×6, pour finir en deux touches.
    const res = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          variant: 'sequential',
          maxPlayers: 2,
          revealDelayMs: 0,
          grid: { width: 6, height: 6 },
          fleet: [{ type: 'torpedo', size: 2 }],
        },
      }),
    });
    const g = (await res.json()) as { gameId: string; code: string; hostToken: string };
    const runtime = server.registry.get(g.gameId)!;
    const host = await open({ kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open({ kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');
    const { playerId: myId, playerToken } = joined.data as {
      playerId: string;
      playerToken: string;
    };
    expect(await command(host.socket, { type: 'ADD_BOT' })).toMatchObject({ ok: true });
    const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
    expect(
      await command(me.socket, {
        type: 'PLACE_FLEET',
        ships: [{ type: 'torpedo', bow: { x: 0, y: 0 }, orientation: 'H' }],
      }),
    ).toMatchObject({ ok: true });
    expect(await command(me.socket, { type: 'SET_READY', ready: true })).toMatchObject({
      ok: true,
    });
    expect(await command(host.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });

    // Antoine (siège 0) coule le bot en deux tirs ; le bot tire une fois entre les deux.
    const cells = bot.fleet[0]!.cells;
    for (const coord of cells) {
      await until(() => runtime.state.round?.expectedShooters[0] === myId);
      expect(
        await command(me.socket, { type: 'FIRE', targetId: bot.playerId, coord }),
      ).toMatchObject({ ok: true });
    }
    await until(() => runtime.state.status === 'FINISHED');
    await until(() => last(host).status === 'FINISHED' && last(me).status === 'FINISHED');

    // Seul l'hôte relance.
    expect(await command(me.socket, { type: 'REMATCH' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    expect(await command(host.socket, { type: 'REMATCH' })).toMatchObject({ ok: true });
    await until(() => host.rematches.length === 1 && me.rematches.length === 1);
    await until(() => last(host).status === 'LOBBY' && last(me).status === 'LOBBY');

    const newId = host.rematches[0]!.gameId;
    expect(newId).not.toBe(g.gameId);
    expect(host.rematches[0]!.code).toBe(g.code);
    expect(runtime.state.status).toBe('FINISHED');
    expect(runtime.state.rematchGameId).toBe(newId);
    expect(server.registry.byActiveCode(g.code)?.gameId).toBe(newId);

    const board = last(host);
    expect(board.gameId).toBe(newId);
    expect(board.code).toBe(g.code);
    expect(board.isHost).toBe(true);
    expect(board.settings).toEqual(runtime.state.settings);
    expect(board.players.map((p) => [p.playerId, p.kind, p.status, p.connected])).toEqual([
      [myId, 'human', 'PLACING', true],
      [bot.playerId, 'bot', 'READY', true],
    ]);
    const mine = last(me);
    expect(mine.gameId).toBe(newId);
    expect(mine.me.playerId).toBe(myId);
    expect(mine.me.fleet).toEqual([]);
    expect(mine.players.find((p) => p.playerId === myId)?.revealed).toEqual([]);

    // Une seule revanche par partie ; l'hôte parle désormais à la nouvelle partie.
    expect(await command(host.socket, { type: 'REMATCH' })).toMatchObject({
      ok: false,
      error: { code: 'WRONG_STATE' },
    });

    // Les anciens jetons ouvrent la nouvelle partie : un téléphone qui revient retrouve sa place.
    const back = await open({ kind: 'player', token: playerToken, hostToken: g.hostToken });
    expect(last(back).gameId).toBe(newId);
    expect(last(back).me.playerId).toBe(myId);
    expect(last(back).isHost).toBe(true);
    back.socket.close();

    // Et elle se joue comme une partie neuve.
    expect(
      await command(me.socket, {
        type: 'PLACE_FLEET',
        ships: [{ type: 'torpedo', bow: { x: 2, y: 2 }, orientation: 'V' }],
      }),
    ).toMatchObject({ ok: true });
    expect(await command(me.socket, { type: 'SET_READY', ready: true })).toMatchObject({
      ok: true,
    });
    expect(await command(host.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    await until(() => last(host).status === 'PLAYING');
    expect(server.registry.get(newId)!.state.round?.expectedShooters).toEqual([myId]);

    host.socket.close();
    me.socket.close();
  });
});
