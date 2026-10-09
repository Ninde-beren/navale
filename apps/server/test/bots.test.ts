import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coordKey } from '@navale/engine';
import type { CreateGameRequest, VisibleEnvelope } from '@navale/protocol';
import {
  command,
  createGame as createGameAt,
  open as openAt,
  startServer,
  until,
  type TestServer,
} from './support.js';

let server: TestServer;
let baseUrl: string;
const open = (auth: Record<string, unknown>) => openAt(baseUrl, auth);
const createGame = (request: CreateGameRequest) => createGameAt(baseUrl, request);

beforeAll(async () => {
  ({ server, baseUrl } = await startServer());
});
afterAll(async () => {
  await server.close();
});

describe('bots', () => {
  it('joue seul contre un bot jusqu’à la fin, en tour par tour', async () => {
    const g = await createGame({
      settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0 },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const host = await open({ kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open({ kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');
    const myId = (joined.data as { playerId: string }).playerId;
    expect(await command(host.socket, { type: 'ADD_BOT' })).toMatchObject({ ok: true });
    const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
    // Antoine place et se déclare prêt avec la flotte du bot, à l'envers : peu importe, elle est valide.
    const ships = bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }));
    expect(await command(me.socket, { type: 'PLACE_FLEET', ships })).toMatchObject({ ok: true });
    expect(await command(me.socket, { type: 'SET_READY', ready: true })).toMatchObject({
      ok: true,
    });
    expect(await command(host.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });

    for (let i = 0; i < 300 && runtime.state.status === 'PLAYING'; i++) {
      await until(
        () =>
          runtime.state.status !== 'PLAYING' || runtime.state.round?.expectedShooters[0] === myId,
      );
      if (runtime.state.status !== 'PLAYING') break;
      const taken = new Set(
        bot.fleet.length
          ? runtime.state.players
              .find((p) => p.kind === 'bot')!
              .shotsReceived.map((s) => coordKey(s.coord))
          : [],
      );
      let coord = { x: 0, y: 0 };
      outer: for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          if (!taken.has(coordKey({ x, y }))) {
            coord = { x, y };
            break outer;
          }
      const ack = await command(me.socket, { type: 'FIRE', targetId: bot.playerId, coord });
      expect(ack).toMatchObject({ ok: true });
    }
    expect(runtime.state.status).toBe('FINISHED');
    const botShots = runtime.state.shotsLog.filter((s) => s.shooterId === bot.playerId);
    expect(botShots.length).toBeGreaterThan(5);
    // Le bot n'a jamais tiré deux fois la même case.
    expect(new Set(botShots.map((s) => coordKey(s.coord))).size).toBe(botShots.length);
    me.socket.disconnect();
    host.socket.disconnect();
  });

  it('en salve, trois bots engagent leur tir dès l’ouverture de la manche', async () => {
    const g = await createGame({
      settings: { variant: 'simultaneous', maxPlayers: 4, revealDelayMs: 0 },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const host = await open({ kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open({ kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');
    const myId = (joined.data as { playerId: string }).playerId;
    for (let i = 0; i < 3; i++)
      expect(await command(host.socket, { type: 'ADD_BOT' })).toMatchObject({ ok: true });
    const fleet = runtime.state.players
      .find((p) => p.kind === 'bot')!
      .fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }));
    await command(me.socket, { type: 'PLACE_FLEET', ships: fleet });
    await command(me.socket, { type: 'SET_READY', ready: true });
    expect(await command(host.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    await until(() => Object.keys(runtime.state.round?.committed ?? {}).length === 3);
    expect(runtime.state.round?.committed[myId]).toBeUndefined();
    const target = runtime.state.players.find((p) => p.kind === 'bot')!;
    expect(
      await command(me.socket, { type: 'FIRE', targetId: target.playerId, coord: { x: 3, y: 3 } }),
    ).toMatchObject({ ok: true });
    await until(() => runtime.state.shotsLog.length >= 4);
    expect(runtime.state.round?.index).toBe(1);
    me.socket.disconnect();
    host.socket.disconnect();
  });
});

describe('cadence (ADR-006)', () => {
  it('retarde la manche suivante de revealDelayMs après un tir résolu', async () => {
    const g = await createGame({
      settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 300 },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const host = await open({ kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open({ kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');
    await command(host.socket, { type: 'ADD_BOT' });
    const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
    await command(me.socket, {
      type: 'PLACE_FLEET',
      ships: bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation })),
    });
    await command(me.socket, { type: 'SET_READY', ready: true });
    await command(host.socket, { type: 'START_GAME' });
    const stamps = new Map<string, number>();
    host.socket.on('event', (e: VisibleEnvelope) =>
      stamps.set(`${e.event.type}:${e.seq}`, Date.now()),
    );
    await command(me.socket, { type: 'FIRE', targetId: bot.playerId, coord: { x: 0, y: 0 } });
    await until(() => [...stamps.keys()].some((k) => k.startsWith('ROUND_STARTED')), 3000);
    const resolved = [...stamps.entries()].find(([k]) => k.startsWith('SHOT_RESOLVED'))!;
    const started = [...stamps.entries()].find(([k]) => k.startsWith('ROUND_STARTED'))!;
    expect(started[1] - resolved[1]).toBeGreaterThanOrEqual(280);
    me.socket.disconnect();
    host.socket.disconnect();
  });
});
