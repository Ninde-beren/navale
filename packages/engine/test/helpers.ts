import type {
  Actor,
  ColorId,
  Command,
  Coord,
  GameEvent,
  GameSettings,
  ShipPlacement,
} from '@navale/protocol';
import { expect } from 'vitest';
import type { DecideContext, Decision } from '../src/core/definition.js';
import { mulberry32 } from '../src/core/random.js';
import { decide } from '../src/battleship/decide.js';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { makeSettings } from '../src/battleship/settings.js';
import type { GameState } from '../src/battleship/state.js';

export const HOST: Actor = { kind: 'host' };
export const SYSTEM: Actor = { kind: 'system' };
export const JOIN: Actor = { kind: 'join' };
export const player = (playerId: string): Actor => ({ kind: 'player', playerId });

/** Flotte fixe du preset `quick` (8×8), tout à gauche, une ligne sur deux. */
export const FIXED_QUICK: ShipPlacement[] = [
  { type: 'cruiser', bow: { x: 0, y: 0 }, orientation: 'H' },
  { type: 'destroyer', bow: { x: 0, y: 2 }, orientation: 'H' },
  { type: 'destroyer', bow: { x: 0, y: 4 }, orientation: 'H' },
  { type: 'torpedo', bow: { x: 0, y: 6 }, orientation: 'H' },
];

/** Paramètres minimaux pour tester les fins de partie vite : un torpilleur de 2 cases. */
export function tinySettings(over: Partial<GameSettings> = {}): GameSettings {
  return makeSettings({
    variant: 'sequential',
    maxPlayers: 4,
    grid: { width: 6, height: 6 },
    fleet: [{ type: 'torpedo', size: 2 }],
    ...over,
  });
}
export const TINY_FLEET: ShipPlacement[] = [
  { type: 'torpedo', bow: { x: 0, y: 0 }, orientation: 'H' },
];

export const COLORS: ColorId[] = ['red', 'yellow', 'blue', 'purple'];

/** Banc d'essai : applique decide puis evolve, garde le journal, fournit des raccourcis. */
export class Harness {
  state: GameState;
  events: GameEvent[] = [];
  now = 1_000;
  random: () => number;
  private n = 0;

  constructor(settings: GameSettings, seed = 1) {
    this.random = mulberry32(seed);
    this.state = initialState({ gameId: 'g1', code: 'ABCD', settings, createdAt: 0 });
  }

  ctx(actor: Actor): DecideContext {
    return { actor, now: this.now, random: this.random, newId: () => `p${++this.n}` };
  }

  run(actor: Actor, command: Command): Decision<GameEvent> {
    const d = decide(this.state, command, this.ctx(actor));
    if (d.ok) {
      for (const e of d.events) {
        this.events.push(e);
        this.state = evolve(this.state, e);
      }
    }
    return d;
  }

  expectOk(actor: Actor, command: Command): GameEvent[] {
    const d = this.run(actor, command);
    if (!d.ok) throw new Error(`refus inattendu ${d.rejection.code} : ${d.rejection.message}`);
    return d.events;
  }

  expectReject(actor: Actor, command: Command, code: string): void {
    const d = this.run(actor, command);
    expect(d.ok, `attendu un refus ${code}`).toBe(false);
    if (!d.ok) expect(d.rejection.code).toBe(code);
  }

  join(name: string, color: ColorId): string {
    const events = this.expectOk(JOIN, { type: 'JOIN_GAME', name, color });
    const joined = events[0];
    if (joined?.type !== 'PLAYER_JOINED') throw new Error('PLAYER_JOINED attendu');
    return joined.playerId;
  }

  place(playerId: string, ships: ShipPlacement[]): void {
    this.expectOk(player(playerId), { type: 'PLACE_FLEET', ships });
  }

  ready(playerId: string, ready = true): void {
    this.expectOk(player(playerId), { type: 'SET_READY', ready });
  }

  start(): GameEvent[] {
    return this.expectOk(HOST, { type: 'START_GAME' });
  }

  fire(shooter: string, target: string, coord: Coord): GameEvent[] {
    return this.expectOk(player(shooter), { type: 'FIRE', targetId: target, coord });
  }

  get active(): string {
    const id = this.state.round?.expectedShooters[0];
    if (!id) throw new Error('pas de tireur actif');
    return id;
  }

  types(events: GameEvent[]): string[] {
    return events.map((e) => e.type);
  }
}

/** Une partie démarrée à `n` joueurs avec la même flotte connue pour tous. */
export function startedGame(
  n: number,
  settings: GameSettings = makeSettings({ variant: 'sequential', maxPlayers: 4 }, 'quick'),
  fleet: ShipPlacement[] = FIXED_QUICK,
  seed = 1,
): { h: Harness; ids: string[] } {
  const h = new Harness(settings, seed);
  const names = ['Antoine', 'Julie', 'Marc', 'Sophie'];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = h.join(names[i]!, COLORS[i]!);
    h.place(id, fleet);
    h.ready(id);
    ids.push(id);
  }
  h.start();
  return { h, ids };
}

/** Joue un tour complet en séquentiel : le joueur actif tire sur `target` en `coord`. */
export function turn(h: Harness, target: string, coord: Coord): GameEvent[] {
  return h.fire(h.active, target, coord);
}
