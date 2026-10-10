import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { command, createGame, open, startServer, until, type TestServer } from './support.js';

let server: TestServer;
let baseUrl: string;

beforeAll(async () => {
  // Le bot tire 50 ms après l'annonce, le fantôme pronostique avant, sans attendre.
  ({ server, baseUrl } = await startServer({ app: { botThinkMs: () => 50, botBetMs: () => 0 } }));
});
afterAll(async () => {
  await server.close();
});

describe('fantômes', () => {
  it('un bot éliminé pronostique chaque manche, en secret, et joue sa carte', async () => {
    const g = await createGame(baseUrl, {
      settings: {
        variant: 'sequential',
        maxPlayers: 3,
        revealDelayMs: 0,
        grid: { width: 6, height: 6 },
        // Trois cases : un tir de barrage seul ne coule personne, la partie va jusqu'à mon tour.
        fleet: [{ type: 'cruiser', size: 3 }],
      },
    });
    const runtime = server.registry.get(g.gameId)!;
    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    const joined = await command(me.socket, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');
    const myId = (joined.data as { playerId: string }).playerId;
    await command(board.socket, { type: 'ADD_BOT' });
    await command(board.socket, { type: 'ADD_BOT' });
    await command(me.socket, {
      type: 'PLACE_FLEET',
      ships: [{ type: 'cruiser', bow: { x: 3, y: 5 }, orientation: 'H' }],
    });
    await command(me.socket, { type: 'SET_READY', ready: true });
    await command(board.socket, { type: 'START_GAME' });

    // Antoine coule le premier bot, case après case (l'autre bot l'y aide peut-être) : il devient fantôme.
    const victim = runtime.state.players.find((p) => p.kind === 'bot')!;
    const ghost = () => runtime.state.players.find((p) => p.playerId === victim.playerId)!;
    // Les bots m'ont coulé avant : je suis le fantôme, mon tour ne reviendra plus.
    const out = () =>
      runtime.state.status !== 'PLAYING' ||
      runtime.state.players.find((p) => p.playerId === myId)?.status === 'ELIMINATED';
    for (const coord of victim.fleet[0]!.cells) {
      await until(
        () =>
          out() ||
          ghost().status === 'ELIMINATED' ||
          runtime.state.round?.expectedShooters[0] === myId,
      );
      if (out() || ghost().status === 'ELIMINATED') break;
      if (ghost().shotsReceived.some((s) => s.coord.x === coord.x && s.coord.y === coord.y))
        continue;
      expect(
        await command(me.socket, { type: 'FIRE', targetId: victim.playerId, coord }),
      ).toMatchObject({ ok: true });
    }
    // Antoine coulé entre-temps : ce n'est plus ce que ce test regarde.
    if (out()) return;
    expect(ghost().status).toBe('ELIMINATED');

    // À mon tour, le fantôme a déjà parié ; mon tir règle son pronostic.
    await until(
      () =>
        out() ||
        (runtime.state.round?.expectedShooters[0] === myId &&
          runtime.state.round.bets[victim.playerId] !== undefined),
    );
    if (out()) return;
    const other = runtime.state.players.find((p) => p.kind === 'bot' && p.status === 'ALIVE')!;
    const free = [0, 1, 2, 3, 4, 5]
      .map((x) => ({ x, y: 3 }))
      .find((c) => !other.shotsReceived.some((s) => s.coord.x === c.x && s.coord.y === c.y))!;
    await command(me.socket, { type: 'FIRE', targetId: other.playerId, coord: free });
    await until(() => board.events.some((e) => e.event.type === 'BETS_SETTLED'));
    expect(ghost().bets.total).toBeGreaterThanOrEqual(1);
    // Sa carte aussi, prête dès la manche suivant son élimination : sans commandant, le barrage,
    // un tir chez chaque survivant, parti juste après le mien.
    const played = board.events.find((e) => e.event.type === 'GHOST_CARD_PLAYED');
    expect(played?.event).toMatchObject({ playerId: victim.playerId, card: 'barrage' });
    const barrage = board.events.filter(
      (e) => e.event.type === 'SHOT_RESOLVED' && e.event.barrage !== undefined,
    );
    expect(barrage.length).toBeGreaterThanOrEqual(1);
    const placed = board.events.filter((e) => e.event.type === 'BET_PLACED');
    expect(placed.length).toBeGreaterThan(0);
    for (const e of [...placed, ...me.events.filter((m) => m.event.type === 'BET_PLACED')])
      expect(e.event).not.toHaveProperty('bet');
    me.socket.disconnect();
    board.socket.disconnect();
  });
});
