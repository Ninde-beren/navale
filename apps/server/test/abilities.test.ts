import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMMANDERS } from '@navale/engine';
import type { Coord, ShipPlacement } from '@navale/protocol';
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

/**
 * Une détection jouée par Antoine chez Julie, dans une partie neuve : ce qu'il en apprend,
 * et les événements qui en parviennent à l'écran central et à Julie, la case visée effacée.
 */
async function detection(commanderId: string, coord: Coord) {
  const g = await createGame(baseUrl, {
    settings: {
      variant: 'sequential',
      maxPlayers: 2,
      revealDelayMs: 0,
      commanders: [...COMMANDERS],
    },
    preset: 'quick',
  });
  const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
  const a = await open(baseUrl, { kind: 'join', code: g.code });
  const b = await open(baseUrl, { kind: 'join', code: g.code });
  const aId = await seat(a, 'Antoine', 'red', commanderId);
  const bId = await seat(b, 'Julie', 'blue', 'ingenieur');
  expect(await command(board.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
  await until(() => lastView(a).me.canUseAbility);
  const from = new Map([board, b].map((client) => [client, client.events.length]));
  expect(await command(a.socket, { type: 'USE_ABILITY', targetId: bId, coord })).toMatchObject({
    ok: true,
  });
  await until(() => lastView(a).me.radarResults.length === 1);
  // Jusqu'à la manche suivante : tout ce que la détection a fait partir est arrivé.
  for (const client of [board, b])
    await until(() =>
      client.events.some((e) => e.event.type === 'ROUND_STARTED' && e.event.round === 1),
    );
  // Seuls diffèrent d'une partie à l'autre les identifiants, l'heure et la case visée.
  const seen = (client: Client) =>
    client.events.slice(from.get(client)).map((e) =>
      JSON.stringify(e.event)
        .replaceAll(aId, 'Antoine')
        .replaceAll(bId, 'Julie')
        .replace(/"startedAt":\d+/, '"startedAt":0')
        .replaceAll(`"x":${coord.x},"y":${coord.y}`, '"x":0,"y":0'),
    );
  const result = { learnt: lastView(a).me.radarResults[0]!, board: seen(board), target: seen(b) };
  for (const client of [board, a, b]) client.socket.disconnect();
  return result;
}

describe('commandants, de bout en bout', () => {
  it('radar et sonar : l’écran central et la cible reçoivent les mêmes messages, avec ou sans navire', async () => {
    // B2 : le croiseur et un contre-torpilleur dans la zone ; G7 : rien que de l'eau.
    const learnt = {
      amiral: [{ shipCells: 6 }, { shipCells: 0 }],
      sonariste: [{ echo: { level: 'strong' } }, { echo: { level: 'weak' } }],
    };
    for (const [commanderId, [onShips, onWater]] of Object.entries(learnt)) {
      const ships = await detection(commanderId, { x: 1, y: 1 });
      const water = await detection(commanderId, { x: 6, y: 6 });
      expect(ships.learnt, commanderId).toMatchObject(onShips!);
      expect(water.learnt, commanderId).toMatchObject(onWater!);
      expect(ships.board.join(), commanderId).toContain('RADAR_RESULT');
      expect(ships.board.join(), commanderId).not.toMatch(/shipCells|contacts|"echo"/);
      expect(water.board, commanderId).toEqual(ships.board);
      expect(water.target, commanderId).toEqual(ships.target);
    }
  });

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
    expect(lastView(a).me.radarResults[0]?.contacts).toHaveLength(6);
    for (const client of [board, b]) {
      await until(() => client.events.some((e) => e.event.type === 'RADAR_RESULT'));
      expect(client.received.some((m) => m.includes('shipCells'))).toBe(false);
      expect(client.received.some((m) => m.includes('contacts'))).toBe(false);
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

  it('un bot commandant joue sa capacité tout seul, et son leurre reste secret', async () => {
    const espion = COMMANDERS.filter((c) => c.ability.type === 'decoy');
    const g = await createGame(baseUrl, {
      settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0, commanders: espion },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    const myId = await seat(me, 'Antoine', 'red', espion[0]!.id);
    expect(await command(board.socket, { type: 'ADD_BOT' })).toMatchObject({ ok: true });
    const bot = runtime.state.players.find((p) => p.kind === 'bot')!;
    expect(bot.commanderId).toBe(espion[0]!.id);
    expect(await command(board.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    // Antoine tire ; à la deuxième manche, le bot pose son leurre.
    await until(() => lastView(me).me.canFire);
    await command(me.socket, { type: 'FIRE', targetId: bot.playerId, coord: { x: 7, y: 7 } });
    await until(
      () => runtime.state.players.find((p) => p.playerId === bot.playerId)!.decoys.length === 1,
    );
    const used = () => board.events.find((e) => e.event.type === 'ABILITY_USED');
    await until(() => used() !== undefined);
    expect(used()!.event).toMatchObject({ playerId: bot.playerId, ability: 'decoy' });
    expect(used()!.event).not.toHaveProperty('coord');
    const decoy = runtime.state.players.find((p) => p.playerId === bot.playerId)!.decoys[0]!;
    for (const client of [board, me])
      expect(
        client.messages.some(
          (m) =>
            JSON.stringify(m.payload).includes('DECOY_PLACED') &&
            JSON.stringify(m.payload).includes(`"x":${decoy.x},"y":${decoy.y}`),
        ),
      ).toBe(false);
    expect(lastView(me).players.find((p) => p.playerId === myId)?.abilityUsesLeft).toBe(1);
    for (const client of [board, me]) client.socket.disconnect();
  });

  it('le bouclier d’un bot reste secret : les autres ne voient que le verre brisé', async () => {
    const capitaine = COMMANDERS.filter((c) => c.ability.type === 'shield');
    const g = await createGame(baseUrl, {
      settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0, commanders: capitaine },
      preset: 'quick',
    });
    const runtime = server.registry.get(g.gameId)!;
    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    await seat(me, 'Antoine', 'red', capitaine[0]!.id);
    expect(await command(board.socket, { type: 'ADD_BOT' })).toMatchObject({ ok: true });
    const botOf = () => runtime.state.players.find((p) => p.kind === 'bot')!;
    expect(await command(board.socket, { type: 'START_GAME' })).toMatchObject({ ok: true });
    // Antoine touche un navire du bot, qui lève son bouclier dessus.
    const ship = botOf().fleet[0]!.cells[0]!;
    await until(() => lastView(me).me.canFire);
    await command(me.socket, { type: 'FIRE', targetId: botOf().playerId, coord: ship });
    await until(() => botOf().shield !== null);
    const shield = botOf().shield!;
    expect(shield.center).toEqual(ship);
    const used = () => board.events.find((e) => e.event.type === 'ABILITY_USED');
    await until(() => used() !== undefined);
    expect(used()!.event).toMatchObject({ playerId: botOf().playerId, ability: 'shield' });
    expect(used()!.event).not.toHaveProperty('coord');
    for (const client of [board, me]) {
      const sent = JSON.stringify(client.messages.map((m) => m.payload));
      expect(sent).not.toContain('"center"');
      expect(sent).not.toContain('"shield":{');
    }
    // Un tir sous le bouclier est bloqué : le verre brisé, lui, est public.
    const neighbour = [
      { x: ship.x + 1, y: ship.y },
      { x: ship.x - 1, y: ship.y },
      { x: ship.x, y: ship.y + 1 },
      { x: ship.x, y: ship.y - 1 },
    ].find((c) => c.x >= 0 && c.y >= 0 && c.x < 8 && c.y < 8)!;
    await until(() => lastView(me).me.canFire);
    await command(me.socket, { type: 'FIRE', targetId: botOf().playerId, coord: neighbour });
    await until(() =>
      board.events.some((e) => e.event.type === 'SHOT_RESOLVED' && e.event.result === 'BLOCKED'),
    );
    await until(
      () =>
        lastView(board).players.find((p) => p.playerId === botOf().playerId)?.pierced.length === 1,
    );
    expect(lastView(board).players.find((p) => p.playerId === botOf().playerId)?.pierced).toEqual([
      neighbour,
    ]);
    for (const client of [board, me]) client.socket.disconnect();
  });
});
