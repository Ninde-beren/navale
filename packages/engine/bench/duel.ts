import type {
  Actor,
  BotLevel,
  Command,
  Commander,
  GameSettings,
  PlayerView,
  PresetId,
  Variant,
} from '@navale/protocol';
import { chooseAction } from '../src/battleship/bot/strategy.js';
import { decide } from '../src/battleship/decide.js';
import { evolve } from '../src/battleship/evolve.js';
import { initialState } from '../src/battleship/index.js';
import { randomFleet } from '../src/battleship/placement.js';
import { projectPrivate } from '../src/battleship/project.js';
import { COMMANDERS, makeSettings } from '../src/battleship/settings.js';
import type { GameState } from '../src/battleship/state.js';
import { mulberry32 } from '../src/core/random.js';

/*
 * Banc de duels : deux bots s'affrontent sur des centaines de parties, chacun avec
 * son commandant, pour mesurer ce qu'une capacité rapporte. Les sièges alternent
 * (en tour par tour, le siège 0 tire le premier) et la partie n° i se joue avec la
 * graine `seed + i` : deux mesures avec la même graine voient les mêmes tirages.
 */

/** Le témoin : un commandant sans usage, pour mesurer une capacité contre rien. */
export const WITNESS: Commander = {
  id: 'temoin',
  name: 'Témoin',
  ability: { type: 'repair' },
  uses: 0,
};

export interface DuelSide {
  /** Un commandant du catalogue de la partie, ou `temoin`. */
  commanderId: string;
  level?: BotLevel;
  /** Quand le bot a le droit de jouer sa capacité ; par défaut, dès qu'il la juge utile. */
  when?: (view: PlayerView) => boolean;
}

export interface DuelOptions {
  a: DuelSide;
  b: DuelSide;
  games: number;
  seed?: number;
  variant?: Variant;
  preset?: PresetId;
  /** Le catalogue de la partie, `COMMANDERS` par défaut ; le témoin y est ajouté. */
  commanders?: readonly Commander[];
}

export interface SideResult {
  wins: number;
  /** Part des parties gagnées. */
  rate: number;
  /** Tours joués (tirs et capacités) par ce camp dans les parties qu'il gagne, en moyenne. */
  turnsToWin: number | null;
  /** Usages de capacité par partie, en moyenne. */
  abilityUses: number;
}

export interface DuelResult {
  games: number;
  draws: number;
  a: SideResult;
  b: SideResult;
  /** Demi-largeur de l'intervalle de confiance à 95 % sur `a.rate`. */
  margin: number;
  /** Manches par partie, en moyenne. */
  rounds: number;
}

interface GameOutcome {
  /** Indice du camp gagnant (0 = a, 1 = b), `null` pour une égalité. */
  winner: 0 | 1 | null;
  turns: [number, number];
  uses: [number, number];
  rounds: number;
}

const HOST: Actor = { kind: 'host' };
const JOIN: Actor = { kind: 'join' };
const COLORS = ['red', 'blue'] as const;
const MAX_COMMANDS = 5000;

export function duelSettings(options: Omit<DuelOptions, 'a' | 'b' | 'games'>): GameSettings {
  const catalogue = options.commanders ?? COMMANDERS;
  return makeSettings(
    {
      variant: options.variant ?? 'sequential',
      maxPlayers: 2,
      commanders: [...catalogue.filter((c) => c.id !== WITNESS.id), WITNESS],
    },
    options.preset ?? 'classic',
  );
}

/** Une partie entre les deux camps ; `first` joue au siège 0. */
export function playDuelGame(
  settings: GameSettings,
  sides: readonly [DuelSide, DuelSide],
  first: 0 | 1,
  seed: number,
): GameOutcome {
  const random = mulberry32(seed);
  let state: GameState = initialState({ gameId: 'duel', code: 'DUEL', settings, createdAt: 0 });
  let ids = 0;
  const run = (actor: Actor, command: Command) => {
    const ctx = { actor, now: 0, random, newId: () => `p${++ids}` };
    const decision = decide(state, command, ctx);
    if (!decision.ok) throw new Error(`duel : ${command.type} refusé, ${decision.rejection.code}`);
    for (const e of decision.events) state = evolve(state, e);
    return decision.events;
  };

  const order = first === 0 ? ([0, 1] as const) : ([1, 0] as const);
  const sideOf = new Map<string, 0 | 1>();
  for (const side of order) {
    const joined = run(JOIN, { type: 'JOIN_GAME', name: `Camp ${side}`, color: COLORS[side] })[0];
    if (joined?.type !== 'PLAYER_JOINED') throw new Error('duel : PLAYER_JOINED attendu');
    const me: Actor = { kind: 'player', playerId: joined.playerId };
    sideOf.set(joined.playerId, side);
    run(me, { type: 'CHOOSE_COMMANDER', commanderId: sides[side].commanderId });
    run(me, { type: 'PLACE_FLEET', ships: randomFleet(settings, random) });
    run(me, { type: 'SET_READY', ready: true });
  }
  run(HOST, { type: 'START_GAME' });

  const turns: [number, number] = [0, 0];
  const uses: [number, number] = [0, 0];
  for (let n = 0; state.status === 'PLAYING' && n < MAX_COMMANDS; n++) {
    const round = state.round;
    const shooter = round?.expectedShooters.find((id) => !round.committed[id]);
    const side = shooter === undefined ? undefined : sideOf.get(shooter);
    if (shooter === undefined || side === undefined) {
      run(HOST, { type: 'FORCE_ROUND' });
      continue;
    }
    const { level = 'normal', when } = sides[side];
    const view = projectPrivate(state, shooter);
    const action = chooseAction(view, random, level, when ? when(view) : true);
    if (!action) {
      run(HOST, { type: 'FORCE_ROUND' });
      continue;
    }
    const actor: Actor = { kind: 'player', playerId: shooter };
    run(
      actor,
      action.ability
        ? { type: 'USE_ABILITY', targetId: action.targetId, coord: action.coord }
        : { type: 'FIRE', targetId: action.targetId, coord: action.coord },
    );
    turns[side]++;
    if (action.ability) uses[side]++;
  }
  if (state.status !== 'FINISHED') throw new Error(`duel : partie ${seed} inachevée`);

  const winners = (state.ranking ?? []).filter((r) => r.rank === 1);
  const winner = winners.length === 1 ? (sideOf.get(winners[0]!.playerId) ?? null) : null;
  return { winner, turns, uses, rounds: state.shotsLog.at(-1)?.round ?? 0 };
}

/** Joue `games` parties, sièges alternés, et résume ce qu'y gagne chaque camp. */
export function duel(options: DuelOptions): DuelResult {
  const settings = duelSettings(options);
  const seed = options.seed ?? 1;
  const wins = [0, 0];
  const turnsInWins = [0, 0];
  const uses = [0, 0];
  let draws = 0;
  let rounds = 0;
  for (let i = 0; i < options.games; i++) {
    const outcome = playDuelGame(settings, [options.a, options.b], (i % 2) as 0 | 1, seed + i);
    rounds += outcome.rounds + 1;
    uses[0]! += outcome.uses[0];
    uses[1]! += outcome.uses[1];
    if (outcome.winner === null) {
      draws++;
      continue;
    }
    wins[outcome.winner]!++;
    turnsInWins[outcome.winner]! += outcome.turns[outcome.winner];
  }
  const side = (i: 0 | 1): SideResult => ({
    wins: wins[i]!,
    rate: wins[i]! / options.games,
    turnsToWin: wins[i]! > 0 ? turnsInWins[i]! / wins[i]! : null,
    abilityUses: uses[i]! / options.games,
  });
  const a = side(0);
  return {
    games: options.games,
    draws,
    a,
    b: side(1),
    margin: 1.96 * Math.sqrt((a.rate * (1 - a.rate)) / options.games),
    rounds: rounds / options.games,
  };
}
