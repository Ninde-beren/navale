import type { GameStatus, Variant } from '@navale/protocol';
import type { PresenceTracker } from '../realtime/presence.js';
import type { GameServer, SocketData } from '../realtime/types.js';
import type { GameHistory, PlayedGame } from '../store/history.js';
import type { GameRegistry } from '../store/registry.js';

/** Fuseau des jours de l'historique : celui de l'exploitant, pas celui du conteneur. */
const TIME_ZONE = 'Europe/Paris';
const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormat = new Intl.DateTimeFormat('fr-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Jour calendaire à Paris, `AAAA-MM-JJ`. */
export function parisDay(at: number): string {
  return dayFormat.format(at);
}

export interface OpenGame {
  code: string;
  status: Extract<GameStatus, 'LOBBY' | 'PLAYING'>;
  variant: Variant;
  maxPlayers: number;
  humans: number;
  humansConnected: number;
  bots: number;
  /** Connexions sans joueur : écran central, spectateurs, téléphones qui choisissent leur nom. */
  otherConnections: number;
  createdAt: number;
  startedAt: number | null;
  lastActivityAt: number;
}

export interface LiveStats {
  games: OpenGame[];
  /** Parties ouvertes avec au moins une connexion. */
  online: number;
  onlinePlaying: number;
  onlineLobby: number;
  playersConnected: number;
  /** Humains inscrits dans les parties en ligne, connectés ou non. */
  playersSeated: number;
}

/** Ce qui se passe en ce moment : parties ouvertes en mémoire et connexions Socket.IO. */
export function liveStats(
  registry: GameRegistry,
  presence: PresenceTracker,
  io: GameServer,
): LiveStats {
  const sockets = new Map<string, { players: number; others: number }>();
  for (const socket of io.of('/').sockets.values()) {
    const data = socket.data as Partial<SocketData>;
    if (!data.gameId) continue;
    const c = sockets.get(data.gameId) ?? { players: 0, others: 0 };
    if (data.playerId) c.players++;
    else c.others++;
    sockets.set(data.gameId, c);
  }

  const games: OpenGame[] = [];
  for (const runtime of registry.all()) {
    const s = runtime.state;
    if (s.status !== 'LOBBY' && s.status !== 'PLAYING') continue;
    const connected = presence.of(s.gameId);
    const humans = s.players.filter((p) => p.kind === 'human');
    games.push({
      code: s.code,
      status: s.status,
      variant: s.settings.variant,
      maxPlayers: s.settings.maxPlayers,
      humans: humans.length,
      humansConnected: humans.filter((p) => connected[p.playerId]).length,
      bots: s.players.length - humans.length,
      otherConnections: sockets.get(s.gameId)?.others ?? 0,
      createdAt: s.createdAt,
      startedAt: s.startedAt,
      lastActivityAt: runtime.lastActivityAt,
    });
  }
  games.sort(
    (a, b) =>
      Number(b.status === 'PLAYING') - Number(a.status === 'PLAYING') ||
      b.lastActivityAt - a.lastActivityAt,
  );

  const online = games.filter((g) => g.humansConnected + g.otherConnections > 0);
  return {
    games,
    online: online.length,
    onlinePlaying: online.filter((g) => g.status === 'PLAYING').length,
    onlineLobby: online.filter((g) => g.status === 'LOBBY').length,
    playersConnected: online.reduce((n, g) => n + g.humansConnected, 0),
    playersSeated: online.reduce((n, g) => n + g.humans, 0),
  };
}

export interface DayStats {
  day: string;
  games: number;
  players: number;
}

export interface HistoryStats {
  /** Les `days` derniers jours, du plus ancien à aujourd'hui. */
  days: DayStats[];
  totalGames: number;
  totalPlayers: number;
  periodGames: number;
  periodPlayers: number;
  /** Les dernières parties lancées, de la plus récente à la plus ancienne. */
  recent: PlayedGame[];
}

/**
 * Parties lancées, lues dans le journal. Un joueur compte une fois par période :
 * la revanche garde ses identifiants, une nouvelle partie lui en donne un autre.
 */
export function historyStats(
  history: GameHistory,
  now: number,
  days = 30,
  recentLimit = 100,
): HistoryStats {
  const played = history.playedGames();
  const base = Date.parse(`${parisDay(now)}T00:00:00Z`);
  // Arithmétique de calendrier en UTC : pas de jour sauté ni doublé au changement d'heure.
  const keys = Array.from({ length: days }, (_, i) =>
    new Date(base - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
  const buckets = new Map(keys.map((k) => [k, { games: 0, players: new Set<string>() }]));
  const periodPlayers = new Set<string>();
  let periodGames = 0;
  for (const g of played) {
    const bucket = buckets.get(parisDay(g.startedAt));
    if (!bucket) continue;
    bucket.games++;
    periodGames++;
    for (const id of g.humans) {
      bucket.players.add(id);
      periodPlayers.add(id);
    }
  }
  return {
    days: keys.map((day) => {
      const b = buckets.get(day);
      return { day, games: b?.games ?? 0, players: b?.players.size ?? 0 };
    }),
    totalGames: played.length,
    totalPlayers: new Set(played.flatMap((g) => g.humans)).size,
    periodGames,
    periodPlayers: periodPlayers.size,
    recent: played.slice(0, recentLimit),
  };
}
