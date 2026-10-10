import { describe, expect, it } from 'vitest';
import { makeSettings } from '@navale/engine';
import type { EventEnvelope, GameEvent, GameStatus } from '@navale/protocol';
import { JournalCompactor } from '../src/runtime/compactor.js';
import { openDatabase } from '../src/store/database.js';
import { EventStore, KEPT_AFTER_COMPACTION } from '../src/store/event-store.js';
import { GameHistory } from '../src/store/history.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ships = [
  {
    shipId: 's',
    type: 'torpedo',
    size: 2,
    bow: { x: 0, y: 0 },
    orientation: 'H' as const,
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    hits: [],
  },
];

/** Le journal d'une partie à deux, un humain et un bot, jusqu'à `end` ; `t0` : son lancement. */
function journal(gameId: string, t0: number, end: 'finished' | 'cancelled'): EventEnvelope[] {
  // Des réglages bruts, sans certaines clés : `unsetSettings` en dépend, la compaction n'y touche pas.
  const { eliminated: _e, ...settings } = makeSettings({ variant: 'sequential', maxPlayers: 2 });
  const shot = (round: number, x: number): GameEvent => ({
    type: 'SHOT_RESOLVED',
    round,
    shooterId: round % 2 ? 'b' : 'a',
    targetId: round % 2 ? 'a' : 'b',
    coord: { x, y: 3 },
    result: 'MISS',
  });
  const events: Array<[number, GameEvent]> = [
    [
      t0 - 60_000,
      {
        type: 'GAME_CREATED',
        gameId,
        code: 'ABCD',
        settings: settings as never,
        createdAt: t0 - 60_000,
      },
    ],
    [
      t0 - 50_000,
      {
        type: 'PLAYER_JOINED',
        playerId: 'a',
        name: 'Antoine',
        color: 'red',
        seat: 0,
        kind: 'human',
      },
    ],
    [
      t0 - 40_000,
      {
        type: 'PLAYER_JOINED',
        playerId: 'b',
        name: 'Corsaire',
        color: 'blue',
        seat: 1,
        kind: 'bot',
        level: 'hard',
      },
    ],
    [t0 - 40_000, { type: 'FLEET_PLACED', playerId: 'b', ships }],
    [t0 - 30_000, { type: 'COMMANDER_CHOSEN', playerId: 'a', commanderId: 'amiral' }],
    [t0 - 20_000, { type: 'COMMANDER_CHOSEN', playerId: 'a', commanderId: 'espion' }],
    [t0 - 20_000, { type: 'FLEET_PLACED', playerId: 'a', ships }],
    [t0 - 10_000, { type: 'PLAYER_READY_CHANGED', playerId: 'a', ready: true }],
    [t0, { type: 'GAME_STARTED', settings: settings as never, seats: ['a', 'b'], startedAt: t0 }],
    [
      t0,
      { type: 'ROUND_STARTED', round: 0, expectedShooters: ['a'], startedAt: t0, deadline: null },
    ],
    [t0 + 10_000, shot(0, 5)],
    [t0 + 20_000, shot(1, 4)],
    [t0 + 30_000, shot(2, 3)],
  ];
  if (end === 'finished') {
    events.push(
      [t0 + 30_000, { type: 'PLAYER_ELIMINATED', playerId: 'b', round: 2, rank: 2 }],
      [t0 + 30_000, { type: 'GAME_FINISHED', ranking: [], winnerId: 'a', finishedAt: t0 + 30_000 }],
      [t0 + 90_000, { type: 'REMATCH_CREATED', newGameId: `${gameId}-r`, code: 'ABCD' }],
    );
  } else {
    // Expirée des heures plus tard : sa durée s'arrête à son dernier tir, pas à l'expiration.
    events.push([t0 + 6 * HOUR, { type: 'GAME_CANCELLED', reason: 'expired' }]);
  }
  return events.map(([at, event], i) => ({ seq: i + 1, at, event }));
}

function setup() {
  const db = openDatabase(':memory:');
  const store = new EventStore(db);
  const history = new GameHistory(db);
  const add = (gameId: string, envelopes: EventEnvelope[], status: GameStatus) => {
    store.createGame(gameId, 'ABCD', 'LOBBY', envelopes[0]!.at);
    store.append(gameId, envelopes, status);
  };
  return { db, store, history, add };
}

describe('compactage des journaux', () => {
  it('garde l’historique et les statistiques tels quels, sans les coups', () => {
    const { store, history, add } = setup();
    const t0 = 1_000_000_000_000;
    add('fini', journal('fini', t0, 'finished'), 'FINISHED');
    add('annule', journal('annule', t0, 'cancelled'), 'CANCELLED');
    const before = history.playedGames();

    const compactor = new JournalCompactor(store, DAY);
    expect(compactor.run(t0 + 2 * DAY).sort()).toEqual(['annule', 'fini']);
    expect(history.playedGames()).toEqual(before);

    const fini = before.find((g) => g.gameId === 'fini')!;
    expect(fini).toMatchObject({
      shots: 3,
      outcome: 'finished',
      winnerId: 'a',
      rematchGameId: 'fini-r',
    });
    expect(fini.playedUntil).toBe(t0 + 30_000);
    expect(fini.seats).toEqual([
      { playerId: 'a', kind: 'human', level: null, commanderId: 'espion' },
      { playerId: 'b', kind: 'bot', level: 'hard', commanderId: null },
    ]);
    expect(fini.unsetSettings).toContain('eliminated');
    const annule = before.find((g) => g.gameId === 'annule')!;
    expect(annule).toMatchObject({ shots: 3, outcome: 'expired', playedUntil: t0 + 30_000 });

    // Les coups sont partis : il ne reste que la vie de la partie.
    for (const gameId of ['fini', 'annule'])
      for (const e of store.events(gameId)) expect(KEPT_AFTER_COMPACTION).toContain(e.event.type);
    expect(store.events('fini').some((e) => e.event.type === 'FLEET_PLACED')).toBe(false);
    // Une partie ne se compacte qu'une fois.
    expect(compactor.run(t0 + 3 * DAY)).toEqual([]);
  });

  it('ne touche ni à une partie finie depuis moins de 24 h, ni à une partie en cours', () => {
    const { store, add } = setup();
    const t0 = 1_000_000_000_000;
    add('recente', journal('recente', t0, 'finished'), 'FINISHED');
    add('en-cours', journal('en-cours', t0, 'finished').slice(0, 12), 'PLAYING');
    const compactor = new JournalCompactor(store, DAY);
    expect(compactor.run(t0 + 2 * HOUR)).toEqual([]);
    expect(compactor.run(t0 + 3 * DAY)).toEqual(['recente']);
    expect(store.events('en-cours')).toHaveLength(12);
  });
});
