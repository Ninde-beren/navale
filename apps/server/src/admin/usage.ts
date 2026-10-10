import { COMMANDERS, PRESETS } from '@navale/engine';
import type { BotLevel, GameSettings, PresetId } from '@navale/protocol';
import type { PlayedGame } from '../store/history.js';
import type { GameMark } from '../store/usage-marks.js';

/** Une ligne d'une répartition : un libellé et son nombre de parties (ou de sièges). */
export interface Bucket {
  label: string;
  count: number;
}

export interface Breakdown {
  title: string;
  /** Ce que l'on compte : des parties, des sessions, des sièges. */
  unit: string;
  rows: Bucket[];
}

export interface ConfigRow {
  label: string;
  games: number;
  /** Durée moyenne des parties terminées de cette configuration. */
  meanMs: number | null;
}

/** Une option de réglage : combien de parties l'ont activée, parmi celles où elle a un sens. */
export interface OptionRow {
  label: string;
  games: number;
  of: number;
}

export interface CommanderRow {
  id: string;
  name: string;
  humanPicks: number;
  botPicks: number;
  /** Sièges tenus avec ce commandant dans des parties terminées. */
  finished: number;
  wins: number;
}

export interface UsageStats {
  /** Parties lancées dans la période. */
  games: number;
  finished: number;
  durationMs: { mean: number; median: number } | null;
  sessions: { count: number; meanGames: number; lengths: Breakdown };
  seats: { humans: number; bots: number; gamesWithBots: number };
  humansPerGame: Breakdown;
  botLevels: Breakdown;
  settings: Breakdown[];
  configurations: ConfigRow[];
  options: OptionRow[];
  commanders: { games: number; rows: CommanderRow[] };
  remote: {
    /** Début de la mesure ; les parties d'avant ne comptent pas dans ces chiffres. */
    since: number;
    measured: number;
    sharedBoard: number;
    sharedPhone: number;
    shared: number;
    remote: number;
  };
}

export interface UsageInput {
  /** Toutes les parties lancées, quelle que soit la période. */
  played: PlayedGame[];
  marks: Map<string, Set<GameMark>>;
  marksSince: number;
  /** Début de la période ; `null` pour tout l'historique. */
  since: number | null;
  /** Lignes gardées dans le tableau des configurations. */
  topConfigurations?: number;
}

const VARIANT = { sequential: 'Tour par tour', simultaneous: 'Salve' } as const;
const PRESET_NAME: Record<PresetId, string> = { classic: 'classique', quick: 'rapide' };
const BOT_LEVEL: Record<BotLevel, string> = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };
const HUMANS = ['1 humain', '2 humains', '3 humains', '4 humains'];
const SESSION_LENGTHS = ['1 partie', '2 parties', '3 parties', '4 et plus'];

function presetOf(settings: GameSettings): PresetId | null {
  const same = (preset: PresetId) => {
    const p = PRESETS[preset];
    return (
      p.grid.width === settings.grid.width &&
      p.grid.height === settings.grid.height &&
      p.fleet.length === settings.fleet.length &&
      p.fleet.every((s, i) => s.size === settings.fleet[i]?.size)
    );
  };
  return same('classic') ? 'classic' : same('quick') ? 'quick' : null;
}

/** Le plateau tel qu'on le lit : « rapide 8×8 », ou la grille et la flotte d'une partie sur mesure. */
export function boardLabel(settings: GameSettings): string {
  const { width, height } = settings.grid;
  const preset = presetOf(settings);
  return preset
    ? `${PRESET_NAME[preset]} ${width}×${height}`
    : `${width}×${height}, ${settings.fleet.length} bateau${settings.fleet.length > 1 ? 'x' : ''}`;
}

/** Ce que l'hôte a choisi en créant la partie, plus le nombre de joueurs à table. */
export function configurationLabel(game: PlayedGame): string {
  return [
    VARIANT[game.settings.variant],
    boardLabel(game.settings),
    `${game.seats.length} joueurs`,
    game.settings.commanders.length > 0 ? 'commandants' : 'sans commandants',
  ].join(' · ');
}

function countBy<T>(items: T[], key: (item: T) => string, order: string[] = []): Bucket[] {
  const counts = new Map<string, number>(order.map((k) => [k, 0]));
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  const rows = [...counts].map(([label, count]) => ({ label, count }));
  return order.length > 0 ? rows : rows.sort((a, b) => b.count - a.count);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Les sessions : une partie et ses revanches successives, de la première à la dernière
 * lancée. Une revanche ouverte mais jamais lancée termine la session.
 */
export function sessionsOf(played: PlayedGame[]): PlayedGame[][] {
  const byId = new Map(played.map((g) => [g.gameId, g]));
  const isRematch = new Set(
    played.flatMap((g) => (g.rematchGameId && byId.has(g.rematchGameId) ? [g.rematchGameId] : [])),
  );
  return played
    .filter((g) => !isRematch.has(g.gameId))
    .map((head) => {
      const chain = [head];
      for (let next = byId.get(head.rematchGameId ?? ''); next;) {
        chain.push(next);
        next = byId.get(next.rematchGameId ?? '');
      }
      return chain;
    });
}

/** Les statistiques d'utilisation de la page `/admin/statistiques`. */
export function usageStats({
  played,
  marks,
  marksSince,
  since,
  topConfigurations = 10,
}: UsageInput): UsageStats {
  const inPeriod = (g: PlayedGame) => since === null || g.startedAt >= since;
  const games = played.filter(inPeriod);
  const finished = games.filter((g) => g.outcome === 'finished' && g.playedUntil !== null);
  const durationOf = (g: PlayedGame) => (g.playedUntil ?? g.startedAt) - g.startedAt;
  const durations = finished.map(durationOf);

  // Sessions de la période : celles dont la première partie y a commencé.
  const allSessions = sessionsOf(played);
  const sessions = allSessions.filter((chain) => inPeriod(chain[0]!));
  const lengths = sessions.map((chain) => chain.length);

  // Une revanche garde les mêmes appareils : ses marques comprennent celles des parties d'avant.
  const effectiveMarks = new Map<string, Set<GameMark>>();
  for (const chain of allSessions) {
    const acc = new Set<GameMark>();
    for (const g of chain) {
      for (const m of marks.get(g.gameId) ?? []) acc.add(m);
      effectiveMarks.set(g.gameId, new Set(acc));
    }
  }
  const measured = games.filter((g) => g.startedAt >= marksSince);
  const withMark = (mark: GameMark) =>
    measured.filter((g) => effectiveMarks.get(g.gameId)?.has(mark)).length;

  const seats = games.flatMap((g) => g.seats);
  const bots = seats.filter((s) => s.kind === 'bot');

  // Configurations, de la plus jouée à la moins jouée.
  const configs = new Map<string, { games: number; durations: number[] }>();
  for (const g of games) {
    const label = configurationLabel(g);
    const c = configs.get(label) ?? { games: 0, durations: [] };
    c.games++;
    if (g.outcome === 'finished' && g.playedUntil !== null) c.durations.push(durationOf(g));
    configs.set(label, c);
  }
  const configurations = [...configs]
    .map(([label, c]) => ({
      label,
      games: c.games,
      meanMs: c.durations.length ? mean(c.durations) : null,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, topConfigurations);

  // Une option compte parmi les parties où elle avait un sens, et où elle existait déjà.
  const option = (
    label: string,
    key: keyof GameSettings,
    on: (s: GameSettings) => boolean,
    applies: (g: PlayedGame) => boolean = () => true,
  ): OptionRow => {
    const pool = games.filter((g) => applies(g) && !g.unsetSettings.includes(key));
    return { label, games: pool.filter((g) => on(g.settings)).length, of: pool.length };
  };
  const threeOrMore = (g: PlayedGame) => g.seats.length >= 3;
  const options: OptionRow[] = [
    option('Chrono de manche', 'roundTimerSeconds', (s) => s.roundTimerSeconds !== null),
    option('Bateaux coulés gardés secrets', 'sunkReveal', (s) => s.sunkReveal === 'secret'),
    option(
      'Fin au premier joueur coulé',
      'endCondition',
      (s) => s.endCondition === 'first_fleet_sunk',
    ),
    option('Bateaux qui ne se touchent pas', 'shipsMayTouch', (s) => !s.shipsMayTouch),
    option(
      'Anti-acharnement',
      'antiFocusMaxStreak',
      (s) => s.antiFocusMaxStreak !== null,
      threeOrMore,
    ),
    option(
      'Éliminés spectateurs, sans fantômes',
      'eliminated',
      (s) => s.eliminated === 'spectators',
      threeOrMore,
    ),
    option(
      'Salve résolue dans l’ordre des sièges',
      'salvoOrder',
      (s) => s.salvoOrder === 'seats',
      (g) => g.settings.variant === 'simultaneous',
    ),
    option('Pas de bot pour relayer un absent', 'afkBotSeconds', (s) => s.afkBotSeconds === null),
  ];

  // Commandants : choix des humains et des bots (au hasard), victoires sur parties terminées.
  const withCommanders = games.filter((g) => g.settings.commanders.length > 0);
  const commanders = new Map<string, CommanderRow>();
  for (const g of withCommanders) {
    for (const seat of g.seats) {
      if (!seat.commanderId) continue;
      const name =
        g.settings.commanders.find((c) => c.id === seat.commanderId)?.name ??
        COMMANDERS.find((c) => c.id === seat.commanderId)?.name ??
        seat.commanderId;
      const row = commanders.get(seat.commanderId) ?? {
        id: seat.commanderId,
        name,
        humanPicks: 0,
        botPicks: 0,
        finished: 0,
        wins: 0,
      };
      if (seat.kind === 'human') row.humanPicks++;
      else row.botPicks++;
      if (g.outcome === 'finished') {
        row.finished++;
        if (g.winnerId === seat.playerId) row.wins++;
      }
      commanders.set(seat.commanderId, row);
    }
  }

  return {
    games: games.length,
    finished: finished.length,
    durationMs: durations.length ? { mean: mean(durations), median: median(durations) } : null,
    sessions: {
      count: sessions.length,
      meanGames: lengths.length ? mean(lengths) : 0,
      lengths: {
        title: 'Parties par session',
        unit: 'sessions',
        rows: countBy(lengths, (n) => SESSION_LENGTHS[Math.min(n, 4) - 1] ?? '—', SESSION_LENGTHS),
      },
    },
    seats: {
      humans: seats.length - bots.length,
      bots: bots.length,
      gamesWithBots: games.filter((g) => g.bots > 0).length,
    },
    humansPerGame: {
      title: 'Humains par partie',
      unit: 'parties',
      rows: countBy(games, (g) => HUMANS[g.humans.length - 1] ?? '—', HUMANS),
    },
    botLevels: {
      title: 'Niveau des bots',
      unit: 'sièges',
      rows: countBy(bots, (s) => BOT_LEVEL[s.level ?? 'normal'], Object.values(BOT_LEVEL)),
    },
    settings: [
      {
        title: 'Mode',
        unit: 'parties',
        rows: countBy(games, (g) => VARIANT[g.settings.variant], Object.values(VARIANT)),
      },
      {
        title: 'Plateau',
        unit: 'parties',
        rows: countBy(games, (g) => boardLabel(g.settings)),
      },
      {
        title: 'Joueurs à table',
        unit: 'parties',
        rows: countBy(games, (g) => `${g.seats.length} joueurs`, [
          '2 joueurs',
          '3 joueurs',
          '4 joueurs',
        ]),
      },
      {
        title: 'Commandants',
        unit: 'parties',
        rows: countBy(games, (g) => (g.settings.commanders.length > 0 ? 'Avec' : 'Sans'), [
          'Avec',
          'Sans',
        ]),
      },
    ],
    configurations,
    options,
    commanders: {
      games: withCommanders.length,
      rows: [...commanders.values()].sort(
        (a, b) => b.humanPicks - a.humanPicks || b.botPicks - a.botPicks,
      ),
    },
    remote: {
      since: marksSince,
      measured: measured.length,
      sharedBoard: withMark('shared_board'),
      sharedPhone: withMark('shared_phone'),
      shared: measured.filter((g) => {
        const m = effectiveMarks.get(g.gameId);
        return m?.has('shared_board') || m?.has('shared_phone');
      }).length,
      remote: withMark('remote_board'),
    },
  };
}
