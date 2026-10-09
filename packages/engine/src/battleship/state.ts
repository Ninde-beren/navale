import type {
  BotLevel,
  ColorId,
  Commander,
  Coord,
  GameSettings,
  GameStatus,
  PendingShot,
  PlayerKind,
  PlayerStatus,
  RadarResult,
  RankEntry,
  ResolvedShot,
  Ship,
  SunkInfo,
} from '@navale/protocol';

export interface Player {
  playerId: string;
  kind: PlayerKind;
  /** Bots seulement : niveau de jeu, `normal` par défaut. */
  level?: BotLevel;
  /** Humain absent relayé par un bot : le niveau de ce bot ; `null` quand il joue lui-même. */
  substitute: BotLevel | null;
  /** Son commandant, parmi `settings.commanders` ; `null` sans choix (bots, parties sans commandants). */
  commanderId: string | null;
  /** Usages restants de la capacité de son commandant. */
  abilityUsesLeft: number;
  /** Privé : ce que ses radars lui ont appris. */
  radarResults: RadarResult[];
  name: string;
  color: ColorId;
  seat: number;
  status: PlayerStatus;
  /** Privé : jamais projeté vers un autre joueur. */
  fleet: Ship[];
  /** Cases révélées chez ce joueur, publiques. Une entrée par case. */
  shotsReceived: Array<{ coord: Coord; result: 'MISS' | 'HIT' }>;
  eliminatedAtRound: number | null;
  rank: number | null;
}

export interface Round {
  index: number;
  /** Séquentiel : `[actif]` ; simultané : tous les vivants. */
  expectedShooters: string[];
  /** Simultané : tirs engagés, privés jusqu'à la résolution. */
  committed: Record<string, PendingShot>;
  startedAt: number;
  deadline: number | null;
}

export interface GameState {
  gameId: string;
  code: string;
  status: GameStatus;
  settings: GameSettings;
  players: Player[];
  round: Round | null;
  shotsLog: ResolvedShot[];
  ranking: RankEntry[] | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Siège du dernier tireur attendu en séquentiel, pour faire tourner le tour. */
  lastShooterSeat: number | null;
  /** Identifiant de la revanche, une fois lancée : on n'en lance qu'une. */
  rematchGameId: string | null;
  /** Numéro du dernier événement appliqué. */
  seq: number;
}

export interface InitialStateInput {
  gameId: string;
  code: string;
  settings: GameSettings;
  createdAt: number;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

export function playerById(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.playerId === playerId);
}

/** Le commandant d'un joueur, d'après les réglages de la partie ; `undefined` sans commandant. */
export function commanderOf(state: GameState, player: Player): Commander | undefined {
  return state.settings.commanders.find((c) => c.id === player.commanderId);
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.status === 'ALIVE');
}

export function isSunk(ship: Ship): boolean {
  return ship.hits.length >= ship.size;
}

/** Ce que les autres joueurs apprennent d'un bateau coulé : ses cases seulement en révélation classique. */
export function sunkInfo(settings: GameSettings, ship: Ship): SunkInfo {
  return settings.sunkReveal === 'classic'
    ? { shipId: ship.shipId, size: ship.size, cells: ship.cells }
    : { shipId: ship.shipId, size: ship.size };
}

export function cellsRemaining(player: Player): number {
  return player.fleet.reduce((n, s) => n + (s.size - s.hits.length), 0);
}

export function shipsRemaining(player: Player): number {
  return player.fleet.filter((s) => !isSunk(s)).length;
}

export function inBounds(settings: GameSettings, c: Coord): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < settings.grid.width && c.y < settings.grid.height;
}
