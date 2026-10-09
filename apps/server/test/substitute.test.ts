import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  command,
  createGame,
  lastView,
  open,
  sleep,
  startServer,
  until,
  type TestServer,
} from './support.js';

let server: TestServer;
let baseUrl: string;

beforeAll(async () => {
  // Un peu de réflexion : la partie ne doit pas se finir toute seule pendant l'absence.
  ({ server, baseUrl } = await startServer({ app: { botThinkMs: () => 50 } }));
});
afterAll(async () => {
  await server.close();
});

describe('joueur absent, de bout en bout', () => {
  it('un bot tire pour moi au bout du délai, et je reprends la main en revenant', async () => {
    const g = await createGame(baseUrl, {
      settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0, afkBotSeconds: 1 },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const host = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');
    const { playerId: myId, playerToken } = joined.data as {
      playerId: string;
      playerToken: string;
    };
    await command(host.socket, { type: 'ADD_BOT' });
    const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
    await command(me.socket, {
      type: 'PLACE_FLEET',
      ships: bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation })),
    });
    await command(me.socket, { type: 'SET_READY', ready: true });
    expect(await command(host.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    expect(runtime.state.round?.expectedShooters[0]).toBe(myId);
    const mine = () => runtime.state.players.find((p) => p.playerId === myId)!;

    // Je disparais pendant mon tour : au bout d'une seconde, un bot tire pour moi.
    me.socket.disconnect();
    await until(() => mine().substitute !== null, 4000);
    expect(mine().substitute).toBe('normal');
    await until(() => runtime.state.shotsLog.some((s) => s.shooterId === myId), 3000);
    expect(mine().kind).toBe('human');

    // Je reviens : je reprends la main tout de suite, l'écran central le voit.
    const back = await open(baseUrl, { kind: 'player', token: playerToken });
    await until(() => mine().substitute === null, 3000);
    await until(() =>
      lastView(back).players.some((p) => p.playerId === myId && p.substitute === null),
    );
    await until(() =>
      host.events.some((e) => e.event.type === 'PLAYER_RESUMED' && e.event.playerId === myId),
    );

    // À mon tour suivant, personne ne tire pour moi.
    await until(
      () => runtime.state.status !== 'PLAYING' || runtime.state.round?.expectedShooters[0] === myId,
      5000,
    );
    if (runtime.state.status === 'PLAYING') {
      const before = runtime.state.shotsLog.length;
      await sleep(400);
      expect(runtime.state.shotsLog.length).toBe(before);
      expect(lastView(back).me.canFire).toBe(true);
    }
    back.socket.disconnect();
    host.socket.disconnect();
  });
});
