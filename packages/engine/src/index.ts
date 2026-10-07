export type {
  Actor,
  DecideContext,
  Decision,
  GameDefinition,
  Presence,
  Rejection,
} from './core/definition.js';
export { ok, reject } from './core/definition.js';
export { mulberry32, pick, randomInt } from './core/random.js';

export type { GameState, InitialStateInput, Player, Round } from './battleship/state.js';
export {
  alivePlayers,
  cellsRemaining,
  coordKey,
  inBounds,
  isSunk,
  playerById,
  sameCoord,
  shipsRemaining,
} from './battleship/state.js';
export {
  PRESETS,
  defaultPresetFor,
  makeSettings,
  validateSettings,
} from './battleship/settings.js';
export {
  cellsOf,
  randomFleet,
  validateFleet,
  type FleetValidation,
} from './battleship/placement.js';
export { legalTargets } from './battleship/rules/targets.js';
export { nextShooters, resolutionOrder } from './battleship/rules/turn-order.js';
export {
  resolveRound,
  type RoundResolution,
  type ShotToResolve,
} from './battleship/rules/resolve.js';
export { computeRanking, isFinishedAfterRound, statsOf } from './battleship/rules/end.js';
export { decide } from './battleship/decide.js';
export { rematchEvents } from './battleship/rematch.js';
export { evolve } from './battleship/evolve.js';
export { projectPrivate, projectPublic } from './battleship/project.js';
export { battleship, initialState } from './battleship/index.js';
export { BOT_NAMES } from './battleship/bot/names.js';
export { chooseShot, woundedCells, type BotShot } from './battleship/bot/strategy.js';
