// API publique du moteur : ce que le serveur et le web en utilisent. Le reste
// (règles de résolution, de classement, d'ordre de tir) ne sert qu'au moteur.

// ---- Contrat commun aux jeux de la plateforme -----------------------------------
export type {
  Actor,
  DecideContext,
  Decision,
  GameDefinition,
  Presence,
  Rejection,
} from './core/definition.js';
export { ok, reject } from './core/definition.js';
export { mulberry32, pick } from './core/random.js';

// ---- Bataille navale : la partie ------------------------------------------------
export type { GameState, InitialStateInput, Player, Round } from './battleship/state.js';
export { battleship, initialState } from './battleship/index.js';
export { HOST_COMMANDS } from './battleship/decide.js';
export { evolve } from './battleship/evolve.js';
export { rematchEvents } from './battleship/rematch.js';
export { privateRecipient, publicEvent } from './battleship/project.js';

// ---- Bataille navale : réglages et flotte, partagés avec le web -----------------
export {
  COMMANDERS,
  PRESETS,
  defaultPresetFor,
  makeSettings,
  normalizeSettings,
  validateSettings,
} from './battleship/settings.js';
export {
  SELF_ABILITIES,
  burstStaggerMs,
  decoyCells,
  missileCells,
  missileStrikes,
  radarZone,
  repairableCells,
  shieldCovers,
} from './battleship/rules/abilities.js';
export { ghostLeadMs } from './battleship/rules/ghosts.js';
export { pacing, type Pacing } from './battleship/rules/pacing.js';
export {
  cellsOf,
  randomFleet,
  shipSize,
  validateFleet,
  type FleetValidation,
} from './battleship/placement.js';
export { coordKey, isSunk, sameCoord } from './battleship/state.js';

// ---- Bataille navale : bot ------------------------------------------------------
export {
  chooseAction,
  chooseBet,
  chooseGhostCard,
  chooseShot,
  type BotAction,
  type BotGhostPlay,
  type BotShot,
} from './battleship/bot/strategy.js';
