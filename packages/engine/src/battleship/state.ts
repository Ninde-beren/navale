import type {
  ColorId,
  Coord,
  GameSettings,
  GameStatus,
  PendingShot,
  PlayerKind,
  PlayerStatus,
  RankEntry,
  ResolvedShot,
  Ship,
} from '@navale/protocol';

export interface Player {
  playerId: string;
  kind: PlayerKind;
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

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.status === 'ALIVE');
}

export function isSunk(ship: Ship): boolean {
  return ship.hits.length >= ship.size;
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
