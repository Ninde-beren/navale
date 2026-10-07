import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { coordKey, isSunk, mulberry32, randomFleet, type GameState } from '@navale/engine';
import type { Ack, Command, PlayerView } from '@navale/protocol';
import { createApp } from '../src/app.js';

type App = Awaited<ReturnType<typeof createApp>>;
let server: App;
let baseUrl: string;

/** Tout ce qu'un socket reçoit, sérialisé, pour y chercher des fuites. */
interface Spy {
  socket: Socket;
  received: string[];
  messages: Array<{ name: string; payload: unknown }>;
  snapshots: PlayerView[];
}

function spyOn(auth: Record<string, unknown>): Promise<Spy> {
  return new Promise((resolve, reject) => {
    const socket = connect(baseUrl, { auth, transports: ['websocket'], reconnection: false });
    const spy: Spy = { socket, received: [], messages: [], snapshots: [] };
    socket.onAny((name: string, payload: unknown) => {
      spy.received.push(JSON.stringify({ name, payload }));
      spy.messages.push({ name, payload });
      if (name === 'snapshot') spy.snapshots.push(payload as PlayerView);
    });
    socket.on('rejected', (err: { code: string }) => reject(new Error(`rejected:${err.code}`)));
    socket.on('connect_error', (err) => reject(err));
    socket.once('snapshot', () => resolve(spy));
  });
}

function command(socket: Socket, cmd: Command | Record<string, unknown>): Promise<Ack> {
  return new Promise((resolve) => socket.emit('command', cmd, (ack: Ack) => resolve(ack)));
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function hiddenCells(state: GameState, playerId: string): Array<{ x: number; y: number }> {
  const p = state.players.find((x) => x.playerId === playerId)!;
  const revealed = new Set(p.shotsReceived.map((s) => coordKey(s.coord)));
  return p.fleet
    .filter((s) => !isSunk(s))
    .flatMap((s) => s.cells.filter((c) => !revealed.has(coordKey(c))));
}

beforeAll(async () => {
  server = await createApp(
    { port: 0, dataDir: '/tmp/navale-test', publicUrl: 'https://navale.test', logLevel: 'silent' },
    ':memory:',
  );
  await server.listen();
  const address = server.app.server.address();
  if (!address || typeof address === 'string') throw new Error('adresse inconnue');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await server.close();
});

describe('serveur', () => {
  it('crée une partie, sert son QR et refuse les paramètres invalides', async () => {
    const res = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { variant: 'sequential', maxPlayers: 3 }, preset: 'quick' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      gameId: string;
      code: string;
      hostToken: string;
      joinUrl: string;
      boardUrl: string;
    };
    expect(body.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(body.joinUrl).toBe(`https://navale.test/play/${body.code}`);
    expect(body.hostToken.length).toBeGreaterThan(30);

    const info = await fetch(`${baseUrl}/api/games/${body.code.toLowerCase()}`);
    expect(await info.json()).toMatchObject({
      gameId: body.gameId,
      status: 'LOBBY',
      players: 0,
      maxPlayers: 3,
      joinable: true,
    });
    const qr = await fetch(`${baseUrl}/api/games/${body.code}/qr.svg`);
    expect(qr.headers.get('content-type')).toContain('image/svg+xml');
    expect(await qr.text()).toContain('<svg');
    expect((await fetch(`${baseUrl}/api/games/ZZZZ`)).status).toBe(404);

    const bad = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { variant: 'nope', maxPlayers: 9 } }),
    });
    expect(bad.status).toBe(400);
    const incoherent = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          variant: 'sequential',
          maxPlayers: 2,
          grid: { width: 6, height: 6 },
          fleet: [{ type: 'a', size: 9 }],
        },
      }),
    });
    expect(incoherent.status).toBe(400);
    expect((await fetch(`${baseUrl}/api/health`)).ok).toBe(true);
  });

  it('refuse un jeton invalide et un code inconnu à la connexion', async () => {
    await expect(spyOn({ kind: 'player', token: 'nope' })).rejects.toThrow(
      'rejected:TOKEN_INVALID',
    );
    await expect(spyOn({ kind: 'board', code: 'ZZZZ' })).rejects.toThrow('rejected:CODE_UNKNOWN');
    await expect(spyOn({ kind: 'nope' })).rejects.toThrow('rejected:BAD_REQUEST');
  });

  it('joue une partie à trois sans jamais envoyer une case cachée à qui ne doit pas la voir', async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          settings: { variant: 'sequential', maxPlayers: 3, revealDelayMs: 0 },
          preset: 'quick',
        }),
      })
    ).json()) as { gameId: string; code: string; hostToken: string };
    const runtime = server.registry.get(created.gameId)!;

    const board = await spyOn({ kind: 'board', code: created.code, hostToken: created.hostToken });
    expect(board.snapshots[0]).toMatchObject({ kind: 'board', isHost: true, status: 'LOBBY' });
    const spectator = await spyOn({ kind: 'board', code: created.code });
    expect(spectator.snapshots[0]).toMatchObject({ isHost: false });

    // Trois joueurs rejoignent, placent, se déclarent prêts.
    const rnd = mulberry32(7);
    const players: Array<{ spy: Spy; id: string; token: string }> = [];
    for (const [name, color] of [
      ['Antoine', 'red'],
      ['Julie', 'yellow'],
      ['Marc', 'blue'],
    ] as const) {
      const spy = await spyOn({ kind: 'join', code: created.code });
      const ack = await command(spy.socket, { type: 'JOIN_GAME', name, color });
      expect(ack.ok).toBe(true);
      if (!ack.ok) return;
      const data = ack.data as { playerId: string; playerToken: string };
      players.push({ spy, id: data.playerId, token: data.playerToken });
      expect(
        await command(spy.socket, {
          type: 'PLACE_FLEET',
          ships: randomFleet(runtime.state.settings, rnd),
        }),
      ).toMatchObject({ ok: true });
      expect(await command(spy.socket, { type: 'SET_READY', ready: true })).toMatchObject({
        ok: true,
      });
    }
    const a = players[0]!;

    // Contrôles d'autorité.
    expect(await command(a.spy.socket, { type: 'START_GAME' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    expect(await command(a.spy.socket, { type: 'FIRE' })).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    });
    expect(await command(spectator.socket, { type: 'SET_READY', ready: true })).toMatchObject({
      ok: false,
      error: { code: 'WRONG_STATE' },
    });
    expect(
      await command(a.spy.socket, { type: 'JOIN_GAME', name: 'Bis', color: 'green' }),
    ).toMatchObject({ ok: false, error: { code: 'WRONG_STATE' } });

    expect(await command(board.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    await tick();
    expect(runtime.state.status).toBe('PLAYING');

    // Chacun tire une fois, à son tour, sur une case libre de la cible.
    for (let i = 0; i < 6; i++) {
      const active = runtime.state.round!.expectedShooters[0]!;
      const shooter = players.find((p) => p.id === active)!;
      await command(shooter.spy.socket, { type: 'REQUEST_SNAPSHOT' });
      await tick();
      const me = shooter.spy.snapshots.at(-1)!.me;
      expect(me.canFire).toBe(true);
      const targetId = me.legalTargets[0]!;
      const target = runtime.state.players.find((p) => p.playerId === targetId)!;
      const taken = new Set(target.shotsReceived.map((s) => coordKey(s.coord)));
      let coord = { x: 0, y: 0 };
      for (let y = 0; y < 8 && taken.has(coordKey(coord)); y++)
        for (let x = 0; x < 8; x++)
          if (!taken.has(coordKey({ x, y }))) {
            coord = { x, y };
            break;
          }
      const ack = await command(shooter.spy.socket, { type: 'FIRE', targetId, coord });
      expect(ack).toMatchObject({ ok: true });
      await tick();
    }
    expect(runtime.state.shotsLog.length).toBe(6);

    // Reconnexion par jeton : l'instantané privé revient, avec ma flotte.
    const again = await spyOn({ kind: 'player', token: a.token });
    expect(again.snapshots[0]!.me.fleet).toHaveLength(4);
    expect(again.snapshots[0]!.me.playerId).toBe(a.id);
    again.socket.disconnect();

    // Fuites : l'écran central et le spectateur ne voient aucune case cachée ;
    // un joueur ne voit que sa propre flotte, et jamais une case cachée d'un autre hors de celle-ci.
    const state = runtime.state;
    const fleetOf = (id: string) =>
      JSON.stringify(state.players.find((p) => p.playerId === id)!.fleet.map((s) => s.cells));
    for (const p of players) {
      for (const snap of p.spy.snapshots) {
        if (!snap.me) continue; // instantané public reçu avant d'avoir rejoint
        expect(snap.me.playerId).toBe(p.id);
        if (snap.me.fleet.length > 0)
          expect(JSON.stringify(snap.me.fleet.map((s) => s.cells))).toBe(fleetOf(p.id));
        expect(JSON.stringify(snap.players)).not.toContain('"fleet"');
      }
    }
    for (const p of state.players) {
      for (const c of hiddenCells(state, p.playerId)) {
        const needle = `"x":${c.x},"y":${c.y}`;
        for (const watcher of [board, spectator]) {
          for (const msg of watcher.received)
            expect(msg, `écran central : case ${coordKey(c)} de ${p.name}`).not.toContain(needle);
        }
        for (const other of players) {
          if (other.id === p.playerId) continue;
          for (const msg of other.spy.messages) {
            if (msg.name === 'snapshot') {
              const v = msg.payload as PlayerView;
              expect(
                JSON.stringify({ players: v.players, round: v.round, lastShots: v.lastShots }),
                `${other.id} voit ${coordKey(c)} de ${p.name}`,
              ).not.toContain(needle);
            } else if (msg.name === 'event') {
              const env = msg.payload as { event: { type: string; playerId?: string } };
              if (env.event.type === 'FLEET_PLACED' && env.event.playerId === other.id) continue;
              expect(
                JSON.stringify(msg.payload),
                `${other.id} reçoit ${coordKey(c)} de ${p.name} dans ${env.event.type}`,
              ).not.toContain(needle);
            }
          }
        }
      }
      for (const other of players) {
        if (other.id === p.playerId) continue;
        for (const msg of other.spy.received) {
          if (msg.includes('"FLEET_PLACED"') && msg.includes(`"playerId":"${p.playerId}"`))
            expect(msg).toContain('"ships":[]');
        }
      }
    }
    for (const msg of [...board.received, ...spectator.received]) {
      expect(msg).not.toContain('"fleet":[{"shipId"'); // settings.fleet (composition) est public, pas une flotte placée
      if (msg.includes('"FLEET_PLACED"')) expect(msg).toContain('"ships":[]');
    }
    expect(board.received.some((m) => m.includes('"SHOT_RESOLVED"'))).toBe(true);

    for (const p of players) p.spy.socket.disconnect();
    board.socket.disconnect();
    spectator.socket.disconnect();
  });

  it('exclut un joueur : jeton révoqué, socket prévenu', async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: { variant: 'sequential', maxPlayers: 2 } }),
      })
    ).json()) as { gameId: string; code: string; hostToken: string };
    const host = await spyOn({ kind: 'host', token: created.hostToken });
    const joiner = await spyOn({ kind: 'join', code: created.code });
    const ack = await command(joiner.socket, { type: 'JOIN_GAME', name: 'Julie', color: 'yellow' });
    if (!ack.ok) throw new Error('join');
    const { playerId, playerToken } = ack.data as { playerId: string; playerToken: string };
    const removed = new Promise<void>((resolve) => joiner.socket.once('removed', () => resolve()));
    expect(await command(host.socket, { type: 'KICK_PLAYER', playerId })).toMatchObject({
      ok: true,
    });
    await removed;
    await expect(spyOn({ kind: 'player', token: playerToken })).rejects.toThrow(
      'rejected:TOKEN_INVALID',
    );
    expect(await command(host.socket, { type: 'ADD_BOT' })).toMatchObject({ ok: true });
    await tick();
    expect(host.snapshots.at(-1)!.players).toHaveLength(1);
    host.socket.disconnect();
  });
});
