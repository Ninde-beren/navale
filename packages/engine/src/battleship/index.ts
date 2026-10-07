import type { BoardView, Command, GameEvent, PlayerView } from '@navale/protocol';
import type { GameDefinition } from '../core/definition.js';
import { decide } from './decide.js';
import { evolve } from './evolve.js';
import { projectPrivate, projectPublic } from './project.js';
import type { GameState, InitialStateInput } from './state.js';

export function initialState(input: InitialStateInput): GameState {
  return {
    gameId: input.gameId,
    code: input.code,
    status: 'LOBBY',
    settings: input.settings,
    players: [],
    round: null,
    shotsLog: [],
    ranking: null,
    createdAt: input.createdAt,
    startedAt: null,
    finishedAt: null,
    lastShooterSeat: null,
    seq: 0,
  };
}

/** La bataille navale, vue par la coquille : la seule abstraction générique de la plateforme. */
export const battleship: GameDefinition<
  GameState,
  Command,
  GameEvent,
  BoardView,
  PlayerView,
  InitialStateInput
> = {
  initialState,
  decide,
  evolve,
  projectPublic,
  projectPrivate,
  isFinished: (s) => s.status === 'FINISHED' || s.status === 'CANCELLED',
  nextDeadline: (s) => (s.status === 'PLAYING' ? (s.round?.deadline ?? null) : null),
};
