import { describe, expect, it } from 'vitest';
import { battleship, makeSettings } from '@navale/engine';
import type { Actor, Command, EventEnvelope, GameEvent } from '@navale/protocol';
import { replayScript, roundCount, roundStart, viewBefore } from '../src/shared/replay.js';

/** Une petite partie à deux, jouée par le moteur, et son journal : Antoine coule Julie en trois manches. */
function journal(): EventEnvelope[] {
  const settings = makeSettings({
    variant: 'sequential',
    maxPlayers: 2,
    grid: { width: 6, height: 6 },
    fleet: [{ type: 'torpedo', size: 2 }],
  });
  const created: GameEvent = {
    type: 'GAME_CREATED',
    gameId: 'g',
    code: 'ABCD',
    settings,
    createdAt: 0,
  };
  let state = battleship.initialState({ gameId: 'g', code: 'ABCD', settings, createdAt: 0 });
  const out: EventEnvelope[] = [];
  let at = 0;
  let ids = 0;
  const push = (events: GameEvent[]) => {
    at++;
    for (const event of events) {
      state = battleship.evolve(state, event);
      out.push({ seq: out.length + 1, at, event });
    }
  };
  push([created]);
  const run = (actor: Actor, command: Command) => {
    const d = battleship.decide(state, command, {
      actor,
      now: at,
      random: () => 0.5,
      newId: () => `p${++ids}`,
    });
    if (!d.ok) throw new Error(d.rejection.message);
    push(d.events);
  };
  const ships = [{ type: 'torpedo', bow: { x: 0, y: 0 }, orientation: 'H' as const }];
  run({ kind: 'join' }, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
  run({ kind: 'join' }, { type: 'JOIN_GAME', name: 'Julie', color: 'blue' });
  for (const id of ['p1', 'p2']) {
    run({ kind: 'player', playerId: id }, { type: 'PLACE_FLEET', ships });
    run({ kind: 'player', playerId: id }, { type: 'SET_READY', ready: true });
  }
  run({ kind: 'host' }, { type: 'START_GAME' });
  run({ kind: 'player', playerId: 'p1' }, { type: 'FIRE', targetId: 'p2', coord: { x: 0, y: 0 } });
  run({ kind: 'player', playerId: 'p2' }, { type: 'FIRE', targetId: 'p1', coord: { x: 5, y: 5 } });
  run({ kind: 'player', playerId: 'p1' }, { type: 'FIRE', targetId: 'p2', coord: { x: 1, y: 0 } });
  return out;
}

describe('replay', () => {
  it('un pas par commande depuis le lancement, jusqu’à la fin', () => {
    const script = replayScript(journal());
    expect(script.start.view).toMatchObject({ status: 'PLAYING', isHost: false });
    expect(script.start.view.round?.index).toBe(0);
    expect(script.steps).toHaveLength(3);
    expect(script.steps.at(-1)?.view.status).toBe('FINISHED');
    expect(script.steps[0]!.envelopes.map((e) => e.event.type)).toEqual([
      'SHOT_RESOLVED',
      'ROUND_RESOLVED',
      'ROUND_STARTED',
    ]);
    // Chacun est montré connecté : pas de « hors ligne » sur une partie qu'on revoit.
    expect(script.start.view.players.every((p) => p.connected)).toBe(true);
  });

  it('l’écran central n’y voit que le public, l’état garde les flottes pour les montrer', () => {
    const script = replayScript(journal());
    for (const p of script.start.view.players) expect(p).not.toHaveProperty('fleet');
    expect(JSON.stringify(script.start.view.players)).not.toContain('"x":0,"y":0');
    expect(script.start.state.players.every((p) => p.fleet.length === 1)).toBe(true);
  });

  it('se parcourt par manche', () => {
    const script = replayScript(journal());
    expect(roundCount(script)).toBe(3);
    expect(viewBefore(script, 0)).toBe(script.start);
    expect(roundStart(script, 0)).toBe(0);
    expect(roundStart(script, 2)).toBe(2);
    expect(roundStart(script, 9)).toBe(3);
  });

  it('refuse un journal sans création ni lancement', () => {
    expect(() => replayScript([])).toThrow();
    const lobby = journal().slice(0, 3);
    expect(() => replayScript(lobby)).toThrow('journal sans lancement');
  });
});
