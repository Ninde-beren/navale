import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMMANDERS } from '@navale/engine';
import type { ShipPlacement } from '@navale/protocol';
import {
  command,
  createGame,
  lastView,
  open,
  startServer,
  until,
  type Client,
  type TestServer,
} from './support.js';

let server: TestServer;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await startServer());
});
afterAll(async () => {
  await server.close();
});

/** Flotte fixe du preset `quick`, tout à gauche, une ligne sur deux. */
const FLEET: ShipPlacement[] = [
  { type: 'cruiser', bow: { x: 0, y: 0 }, orientation: 'H' },
  { type: 'destroyer', bow: { x: 0, y: 2 }, orientation: 'H' },
  { type: 'destroyer', bow: { x: 0, y: 4 }, orientation: 'H' },
  { type: 'torpedo', bow: { x: 0, y: 6 }, orientation: 'H' },
];

async function seat(client: Client, name: string, color: 'red' | 'blue', commanderId: string) {
  const joined = await command(client.socket, { type: 'JOIN_GAME', name, color });
  if (!joined.ok) throw new Error('join');
  expect(await command(client.socket, { type: 'CHOOSE_COMMANDER', commanderId })).toMatchObject({
    ok: true,
  });
  expect(await command(client.socket, { type: 'PLACE_FLEET', ships: FLEET })).toMatchObject({
    ok: true,
  });
  expect(await command(client.socket, { type: 'SET_READY', ready: true })).toMatchObject({
    ok: true,
  });
  return (joined.data as { playerId: string }).playerId;
}

describe('commandants, de bout en bout', () => {
  it('le radar renseigne son auteur seulement ; la réparation se voit sur l’écran central', async () => {
    const g = await createGame(baseUrl, {
      settings: {
        variant: 'sequential',
        maxPlayers: 2,
        revealDelayMs: 0,
        commanders: [...COMMANDERS],
      },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const a = await open(baseUrl, { kind: 'join', code: g.code });
    const b = await open(baseUrl, { kind: 'join', code: g.code });
    const aId = await seat(a, 'Antoine', 'red', 'amiral');
    const bId = await seat(b, 'Julie', 'blue', 'ingenieur');
    expect(await command(board.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    await until(() => lastView(a).me.canUseAbility);

    // Antoine passe son radar sur B2 chez Julie : six cases de navire, qu'il est seul à apprendre.
    expect(
      await command(a.socket, { type: 'USE_ABILITY', targetId: bId, coord: { x: 1, y: 1 } }),
    ).toMatchObject({ ok: true });
    await until(() => lastView(a).me.radarResults.length === 1);
    expect(lastView(a).me.radarResults[0]).toMatchObject({ targetId: bId, shipCells: 6 });
    for (const client of [board, b]) {
      await until(() => client.events.some((e) => e.event.type === 'RADAR_RESULT'));
      expect(client.received.some((m) => m.includes('shipCells'))).toBe(false);
      const types = client.events.map((e) => e.event.type);
      expect(types, types.join(',')).toContain('ABILITY_USED');
    }
    expect(lastView(board).players.find((p) => p.playerId === aId)?.abilityUsesLeft).toBe(0);
    expect(runtime.state.shotsLog).toHaveLength(0);

    // Julie rate, Antoine touche Julie en A1, Julie répare : la case redevient inconnue pour tous.
    await until(() => lastView(b).me.canFire);
    await command(b.socket, { type: 'FIRE', targetId: aId, coord: { x: 7, y: 7 } });
    await until(() => lastView(a).me.canFire);
    await command(a.socket, { type: 'FIRE', targetId: bId, coord: { x: 0, y: 0 } });
    await until(() => lastView(b).me.canUseAbility);
    expect(lastView(board).players.find((p) => p.playerId === bId)?.revealed).toHaveLength(1);
    expect(
      await command(b.socket, { type: 'USE_ABILITY', targetId: bId, coord: { x: 0, y: 0 } }),
    ).toMatchObject({ ok: true });
    await until(() => board.events.some((e) => e.event.type === 'SHIP_REPAIRED'));
    await until(
      () => lastView(board).players.find((p) => p.playerId === bId)?.revealed.length === 0,
    );
    expect(lastView(b).me.cellsRemaining).toBe(12);
    for (const client of [board, a, b]) client.socket.disconnect();
  });
});
