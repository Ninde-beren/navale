import { describe, expect, it } from 'vitest';
import { COMMANDERS, makeSettings } from '@navale/engine';
import type { GameSettings } from '@navale/protocol';
import { boardLabel, sessionsOf, usageStats } from '../src/admin/usage.js';
import type { PlayedGame, PlayedSeat } from '../src/store/history.js';
import type { GameMark } from '../src/store/usage-marks.js';

const MIN = 60_000;
const T0 = Date.parse('2026-10-01T18:00:00Z');

const human = (id: string, commanderId: string | null = null): PlayedSeat => ({
  playerId: id,
  kind: 'human',
  level: null,
  commanderId,
});
const bot = (
  id: string,
  level: PlayedSeat['level'] = 'normal',
  commanderId: string | null = null,
): PlayedSeat => ({
  playerId: id,
  kind: 'bot',
  level,
  commanderId,
});

/** Une partie lancée, terminée par défaut au bout de `minutes`. */
function game(
  id: string,
  seats: PlayedSeat[],
  options: {
    at?: number;
    minutes?: number;
    outcome?: PlayedGame['outcome'];
    winnerId?: string | null;
    rematch?: string;
    settings?: Partial<GameSettings>;
    unset?: Array<keyof GameSettings>;
  } = {},
): PlayedGame {
  const at = options.at ?? T0;
  const outcome = options.outcome ?? 'finished';
  const settings = makeSettings({
    variant: 'sequential',
    maxPlayers: Math.max(2, seats.length),
    ...options.settings,
  });
  const humans = seats.filter((s) => s.kind === 'human').map((s) => s.playerId);
  return {
    gameId: id,
    code: 'ABCD',
    variant: settings.variant,
    startedAt: at,
    playedUntil: outcome === 'playing' ? null : at + (options.minutes ?? 10) * MIN,
    outcome,
    humans,
    bots: seats.length - humans.length,
    shots: 0,
    settings,
    unsetSettings: options.unset ?? [],
    seats,
    winnerId: outcome === 'finished' ? (options.winnerId ?? seats[0]?.playerId ?? null) : null,
    rematchGameId: options.rematch ?? null,
  };
}

const noMarks = new Map<string, Set<GameMark>>();
const stats = (played: PlayedGame[], extra: Partial<Parameters<typeof usageStats>[0]> = {}) =>
  usageStats({ played, marks: noMarks, marksSince: 0, hostLinkSince: 0, since: null, ...extra });

describe('statistiques d’utilisation', () => {
  it('suit une session de revanche en revanche, et s’arrête à une revanche jamais lancée', () => {
    const played = [
      game('a', [human('h1'), bot('b1')], { rematch: 'b' }),
      game('b', [human('h1'), bot('b1')], { at: T0 + 20 * MIN, rematch: 'c' }),
      game('c', [human('h1'), bot('b1')], { at: T0 + 40 * MIN }),
      game('d', [human('h2'), human('h3')], { rematch: 'jamais-lancee' }),
    ];
    expect(sessionsOf(played).map((s) => s.map((g) => g.gameId))).toEqual([['a', 'b', 'c'], ['d']]);
    const s = stats(played);
    expect(s.sessions.count).toBe(2);
    expect(s.sessions.meanGames).toBe(2);
    expect(s.sessions.lengths.rows).toEqual([
      { label: '1 partie', count: 1 },
      { label: '2 parties', count: 0 },
      { label: '3 parties', count: 1 },
      { label: '4 et plus', count: 0 },
    ]);
  });

  it('mesure la durée des seules parties terminées : moyenne et médiane', () => {
    const s = stats([
      game('a', [human('h1'), bot('b1')], { minutes: 10 }),
      game('b', [human('h1'), bot('b1')], { minutes: 20 }),
      game('c', [human('h1'), bot('b1')], { minutes: 60 }),
      game('d', [human('h1'), bot('b1')], { outcome: 'cancelled', minutes: 500 }),
      game('e', [human('h1'), bot('b1')], { outcome: 'playing' }),
    ]);
    expect(s.games).toBe(5);
    expect(s.finished).toBe(3);
    expect(s.durationMs).toEqual({ mean: 30 * MIN, median: 20 * MIN });
  });

  it('compte les humains par partie, les sièges humains et bots, et le niveau des bots', () => {
    const s = stats([
      game('a', [human('h1'), bot('b1', 'easy')]),
      game('b', [human('h1'), human('h2'), bot('b2', 'hard'), bot('b3', 'hard')]),
      game('c', [human('h1'), human('h2'), human('h3'), human('h4')]),
    ]);
    expect(s.humansPerGame.rows).toEqual([
      { label: '1 humain', count: 1 },
      { label: '2 humains', count: 1 },
      { label: '3 humains', count: 0 },
      { label: '4 humains', count: 1 },
    ]);
    expect(s.seats).toEqual({ humans: 7, bots: 3, gamesWithBots: 2 });
    expect(s.botLevels.rows).toEqual([
      { label: 'Facile', count: 1 },
      { label: 'Normal', count: 0 },
      { label: 'Difficile', count: 2 },
    ]);
  });

  it('classe les configurations et nomme les plateaux', () => {
    const classic = makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'classic');
    const quick = makeSettings({ variant: 'simultaneous', maxPlayers: 3 }, 'quick');
    expect(boardLabel(classic)).toBe('classique 10×10');
    expect(boardLabel(quick)).toBe('rapide 8×8');
    expect(boardLabel({ ...quick, grid: { width: 9, height: 9 } })).toBe('9×9, 4 bateaux');
    expect(
      boardLabel({
        ...quick,
        grid: { width: 6, height: 6 },
        fleet: [{ type: 'torpedo', size: 2 }],
      }),
    ).toBe('6×6, 1 bateau');

    const salve: Partial<GameSettings> = { variant: 'simultaneous', commanders: [...COMMANDERS] };
    const s = stats([
      game('a', [human('h1'), bot('b1'), bot('b2')], { settings: salve, minutes: 12 }),
      game('b', [human('h1'), bot('b1'), bot('b2')], { settings: salve, minutes: 18 }),
      game('c', [human('h1'), human('h2')]),
    ]);
    expect(s.configurations).toEqual([
      { label: 'Salve · rapide 8×8 · 3 joueurs · commandants', games: 2, meanMs: 15 * MIN },
      {
        label: 'Tour par tour · classique 10×10 · 2 joueurs · sans commandants',
        games: 1,
        meanMs: 10 * MIN,
      },
    ]);
    expect(s.settings.find((b) => b.title === 'Mode')?.rows).toEqual([
      { label: 'Tour par tour', count: 1 },
      { label: 'Salve', count: 2 },
    ]);
  });

  it('compte une option parmi les parties où elle a un sens', () => {
    const s = stats([
      game('a', [human('h1'), bot('b1')], {
        settings: { antiFocusMaxStreak: 2, roundTimerSeconds: 45 },
      }),
      game('b', [human('h1'), bot('b1'), bot('b2')], { settings: { antiFocusMaxStreak: 2 } }),
      game('c', [human('h1'), bot('b1'), bot('b2')]),
    ]);
    const option = (label: string) => s.options.find((o) => o.label === label);
    expect(option('Chrono de manche')).toMatchObject({ games: 1, of: 3 });
    // À deux, l'anti-acharnement n'a pas de sens : seules les parties à trois comptent.
    expect(option('Anti-acharnement')).toMatchObject({ games: 1, of: 2 });
    expect(option('Salve résolue dans l’ordre des sièges')).toMatchObject({ games: 0, of: 0 });
  });

  it('ne compte pas une option dans les parties jouées avant qu’elle existe', () => {
    const s = stats([
      // Avant les fantômes : le journal ne dit rien, les éliminés étaient spectateurs d'office.
      game('ancienne', [human('h1'), bot('b1'), bot('b2')], {
        settings: { eliminated: 'spectators' },
        unset: ['eliminated'],
      }),
      game('choisie', [human('h1'), bot('b1'), bot('b2')], {
        settings: { eliminated: 'spectators' },
      }),
      game('fantomes', [human('h1'), bot('b1'), bot('b2')]),
    ]);
    expect(s.options.find((o) => o.label === 'Éliminés spectateurs, sans fantômes')).toMatchObject({
      games: 1,
      of: 2,
    });
  });

  it('compte les choix de commandants et leurs victoires sur les parties terminées', () => {
    const settings = { commanders: [...COMMANDERS] };
    const s = stats([
      game('a', [human('h1', 'amiral'), bot('b1', 'normal', 'capitaine')], {
        settings,
        winnerId: 'h1',
      }),
      game('b', [human('h1', 'amiral'), bot('b1', 'normal', 'amiral')], {
        settings,
        winnerId: 'b1',
      }),
      game('c', [human('h2', 'capitaine'), bot('b2', 'normal', 'espion')], {
        settings,
        outcome: 'cancelled',
      }),
      game('d', [human('h3'), bot('b3')]),
    ]);
    expect(s.commanders.games).toBe(3);
    const row = (id: string) => s.commanders.rows.find((r) => r.id === id);
    expect(row('amiral')).toMatchObject({
      name: 'Amiral',
      humanPicks: 2,
      botPicks: 1,
      finished: 3,
      wins: 2,
    });
    expect(row('capitaine')).toMatchObject({ humanPicks: 1, botPicks: 1, finished: 1, wins: 0 });
    expect(row('espion')).toMatchObject({ humanPicks: 0, botPicks: 1, finished: 0, wins: 0 });
    // Les plus choisis par les humains en tête.
    expect(s.commanders.rows[0]?.id).toBe('amiral');
  });

  it('propage partage et jeu à distance aux revanches, et ne mesure que depuis le début de la mesure', () => {
    const played = [
      game('avant', [human('h0'), bot('b0')], { at: T0 - 60 * MIN }),
      game('a', [human('h1'), human('h2')], { rematch: 'b' }),
      game('b', [human('h1'), human('h2')], { at: T0 + 20 * MIN }),
      game('c', [human('h3'), bot('b3')]),
      game('d', [human('h4'), bot('b4')]),
    ];
    const marks = new Map<string, Set<GameMark>>([
      ['avant', new Set<GameMark>(['remote_board'])],
      ['a', new Set<GameMark>(['shared_board', 'remote_board'])],
      ['c', new Set<GameMark>(['shared_phone'])],
    ]);
    const s = stats(played, { marks, marksSince: T0 });
    expect(s.remote).toEqual({
      since: T0,
      measured: 4,
      sharedBoard: 2,
      sharedPhone: 1,
      shared: 3,
      remote: 2,
    });
  });

  it('mesure le lien d’hôte depuis sa propre mise en ligne, revanches comprises', () => {
    const played = [
      game('avant', [human('h0'), bot('b0')], { at: T0 - 60 * MIN }),
      game('a', [human('h1'), human('h2')], { rematch: 'b' }),
      game('b', [human('h1'), human('h2')], { at: T0 + 20 * MIN }),
      game('c', [human('h3'), bot('b3')]),
    ];
    const marks = new Map<string, Set<GameMark>>([
      ['avant', new Set<GameMark>(['host_link', 'host_moved'])],
      ['a', new Set<GameMark>(['host_link', 'host_moved'])],
      ['c', new Set<GameMark>(['host_link'])],
    ]);
    const s = stats(played, { marks, marksSince: 0, hostLinkSince: T0 });
    // La revanche « b » garde les boutons passés sur l'autre appareil dans « a ».
    expect(s.hostLink).toEqual({ since: T0, measured: 3, shown: 3, moved: 2 });
    // Le partage, mesuré depuis plus longtemps, compte aussi la partie d'avant.
    expect(s.remote.measured).toBe(4);
  });

  it('ne garde que la période demandée, sessions comprises', () => {
    const played = [
      game('vieille', [human('h1'), bot('b1')], { at: T0 - 40 * 24 * 60 * MIN }),
      game('recente', [human('h1'), bot('b1')], { at: T0 }),
    ];
    const s = stats(played, { since: T0 - 30 * 24 * 60 * MIN });
    expect(s.games).toBe(1);
    expect(s.sessions.count).toBe(1);
  });
});
