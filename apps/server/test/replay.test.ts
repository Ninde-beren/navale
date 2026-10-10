import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReplaySchema } from '@navale/protocol';
import { command, createGame, open, startServer, until, type TestServer } from './support.js';

let server: TestServer;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await startServer());
});
afterAll(async () => {
  await server.close();
});

describe('replay', () => {
  it('donne le journal complet d’une partie terminée, et rien d’une partie en cours', async () => {
    const g = await createGame(baseUrl, {
      settings: {
        variant: 'sequential',
        maxPlayers: 2,
        revealDelayMs: 0,
        grid: { width: 6, height: 6 },
        fleet: [{ type: 'torpedo', size: 2 }],
      },
    });
    const runtime = server.registry.get(g.gameId)!;
    const replayOf = (gameId: string) => fetch(`${baseUrl}/api/games/${gameId}/replay`);
    expect((await replayOf('inconnue')).status).toBe(404);
    expect((await replayOf(g.gameId)).status).toBe(404); // au lobby

    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    const myId = (joined as { data: { playerId: string } }).data.playerId;
    await command(board.socket, { type: 'ADD_BOT' });
    await command(me.socket, {
      type: 'PLACE_FLEET',
      ships: [{ type: 'torpedo', bow: { x: 4, y: 5 }, orientation: 'H' }],
    });
    await command(me.socket, { type: 'SET_READY', ready: true });
    await command(board.socket, { type: 'START_GAME' });
    expect((await replayOf(g.gameId)).status).toBe(404); // en cours : ses secrets comptent

    // Antoine coule la bouée du bot, case après case.
    const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
    for (const coord of bot.fleet[0]!.cells) {
      await until(
        () =>
          runtime.state.status !== 'PLAYING' || runtime.state.round?.expectedShooters[0] === myId,
      );
      if (runtime.state.status !== 'PLAYING') break;
      await command(me.socket, { type: 'FIRE', targetId: bot.playerId, coord });
    }
    await until(() => runtime.state.status === 'FINISHED');

    const res = await replayOf(g.gameId);
    expect(res.status).toBe(200);
    const replay = ReplaySchema.parse(await res.json());
    expect(replay.code).toBe(g.code);
    expect(replay.events[0]?.event.type).toBe('GAME_CREATED');
    expect(replay.events.at(-1)?.event.type).toBe('GAME_FINISHED');
    // La partie finie, sa flotte n'est plus un secret : le journal complet la donne.
    const placed = replay.events.filter((e) => e.event.type === 'FLEET_PLACED');
    expect(placed.every((e) => e.event.type === 'FLEET_PLACED' && e.event.ships.length > 0)).toBe(
      true,
    );
    me.socket.disconnect();
    board.socket.disconnect();
  });
});
