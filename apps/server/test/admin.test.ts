import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { HostLink } from '@navale/protocol';
import { basicCredentials } from '../src/http/admin.js';
import { parisDay } from '../src/admin/stats.js';
import { OBSERVER_COOKIE } from '../src/admin/tracking.js';
import {
  command,
  createGame,
  open as openClient,
  startServer,
  until,
  type TestServer,
} from './support.js';

/** Ici, seule la connexion compte, pas ce qu'elle reçoit. */
const open = async (baseUrl: string, auth: Record<string, unknown>) =>
  (await openClient(baseUrl, auth)).socket;
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
/** Valeur d'une tuile repérée par `data-stat`. */
function stat(html: string, name: string): number {
  const m = new RegExp(`data-stat="${name}">([^<]*)<`).exec(html);
  if (!m?.[1]) throw new Error(`tuile ${name} absente`);
  return Number(m[1].replace(/\s/g, ''));
}

async function boot(adminPassword: string | null) {
  const { server, baseUrl } = await startServer({
    config: { adminUser: 'antoine', adminPassword },
  });
  return { app: server, baseUrl };
}

describe('accès à /admin', () => {
  it('reste fermé tant qu’aucun mot de passe n’est défini', async () => {
    const { app } = await boot(null);
    try {
      const res = await app.app.inject({
        method: 'GET',
        url: '/admin',
        headers: { authorization: basic('admin', '') },
      });
      expect(res.statusCode).toBe(503);
      expect(res.body).not.toContain('<html');
    } finally {
      await app.close();
    }
  });

  it('demande les identifiants et refuse les mauvais', async () => {
    const { app } = await boot('s3cret');
    try {
      for (const authorization of [
        undefined,
        basic('antoine', 'faux'),
        basic('admin', 's3cret'),
        'Bearer s3cret',
      ]) {
        const res = await app.app.inject({
          method: 'GET',
          url: '/admin',
          headers: authorization ? { authorization } : {},
        });
        expect(res.statusCode, authorization).toBe(401);
        expect(res.headers['www-authenticate']).toContain('Basic realm="Navale admin"');
        expect(res.body).not.toContain('data-stat');
      }
    } finally {
      await app.close();
    }
  });

  it('ouvre la page avec les bons identifiants, sans cache ni indexation', async () => {
    const { app } = await boot('s3cret');
    try {
      for (const url of ['/admin', '/admin/']) {
        const res = await app.app.inject({
          method: 'GET',
          url,
          headers: { authorization: basic('antoine', 's3cret') },
        });
        expect(res.statusCode, url).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
        expect(res.headers['content-security-policy']).toContain("default-src 'none'");
        expect(stat(res.body, 'games-online')).toBe(0);
        expect(res.body).toContain('Aucune partie jouée pour l’instant.');
      }
    } finally {
      await app.close();
    }
  });

  it('lit un mot de passe qui contient « : »', () => {
    expect(basicCredentials(basic('antoine', 'a:b:c'))).toEqual(['antoine', 'a:b:c']);
    expect(basicCredentials('Basic pasdedeuxpoints')).toBeNull();
    expect(basicCredentials(undefined)).toBeNull();
  });
});

describe('chiffres de /admin', () => {
  let app: TestServer;
  let baseUrl: string;
  const page = async () => {
    const res = await app.app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: basic('antoine', 's3cret') },
    });
    return res.body;
  };
  beforeAll(async () => {
    ({ app, baseUrl } = await boot('s3cret'));
  });
  afterAll(async () => {
    await app.close();
  });

  it('compte les parties en ligne, les joueurs connectés, puis l’historique', async () => {
    // Une partie que personne n'a ouverte : ouverte, mais pas en ligne.
    await createGame(baseUrl);
    const g = await createGame(baseUrl);
    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    const joined = await command(me, { type: 'JOIN_GAME', name: 'Antoine', color: 'red' });
    if (!joined.ok) throw new Error('join');

    let html = await page();
    expect(stat(html, 'games-online')).toBe(1);
    expect(stat(html, 'players-connected')).toBe(1);
    expect(html).toContain(g.code);
    // Lien vers l'écran central en spectateur, dans un nouvel onglet.
    expect(html).toContain(`href="/board/${g.code}" target="_blank" rel="noopener noreferrer"`);
    expect(html).toContain('personne de connecté');
    expect(stat(html, 'games-total')).toBe(0);

    // Le joueur se déconnecte : la partie reste en ligne par l'écran central.
    me.disconnect();
    await until(async () => stat(await page(), 'players-connected') === 0);
    expect(stat(await page(), 'games-online')).toBe(1);

    // Lancement contre un bot : la partie entre dans l'historique.
    const { playerToken } = joined.data as { playerToken: string };
    const player = await open(baseUrl, { kind: 'player', token: playerToken });
    expect((await command(board, { type: 'ADD_BOT' })).ok).toBe(true);
    // Le joueur reprend la flotte du bot : elle est valide, c'est tout ce qui compte ici.
    const bot = app.registry.get(g.gameId)!.state.players.find((p) => p.kind === 'bot')!;
    const ships = bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }));
    expect((await command(player, { type: 'PLACE_FLEET', ships })).ok).toBe(true);
    expect((await command(player, { type: 'SET_READY', ready: true })).ok).toBe(true);
    expect((await command(board, { type: 'START_GAME' })).ok).toBe(true);

    html = await page();
    expect(stat(html, 'games-total')).toBe(1);
    expect(stat(html, 'players-total')).toBe(1);
    expect(stat(html, 'games-period')).toBe(1);
    expect(stat(html, 'players-period')).toBe(1);
    expect(html).toContain('En cours');

    // Annulée par l'hôte : elle reste dans l'historique avec son issue.
    expect((await command(board, { type: 'CANCEL_GAME' })).ok).toBe(true);
    html = await page();
    expect(stat(html, 'games-online')).toBe(0);
    expect(stat(html, 'games-total')).toBe(1);
    expect(html).toContain('Annulée');

    board.disconnect();
    player.disconnect();
  });

  it('liste les retours, échappés, avec leur contexte', async () => {
    expect(stat(await page(), 'feedback-total')).toBe(0);
    app.feedback.save({
      at: Date.now(),
      message: 'Le tir <script>alert(1)</script> part deux fois',
      email: 'julie@exemple.fr',
      path: '/play/ABCD',
      code: 'ABCD',
      screen: '390×844',
      userAgent: 'Mozilla/5.0 (iPhone)',
      version: 'abc1234',
    });
    const html = await page();
    expect(stat(html, 'feedback-total')).toBe(1);
    expect(html).toContain('Le tir &lt;script&gt;alert(1)&lt;/script&gt; part deux fois');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="mailto:julie@exemple.fr"');
    expect(html).toContain('/play/ABCD · partie ABCD · 390×844 · version abc1234');
    expect(html).toContain('Envoi par mail désactivé');
  });

  it('range les parties par jour de Paris', () => {
    // 23 h 30 UTC un 9 octobre, c'est déjà le 10 à Paris (UTC+2).
    expect(parisDay(Date.parse('2026-10-09T23:30:00Z'))).toBe('2026-10-10');
    expect(parisDay(Date.parse('2026-01-09T23:30:00Z'))).toBe('2026-01-10');
    expect(parisDay(Date.parse('2026-01-09T22:30:00Z'))).toBe('2026-01-09');
  });
});

describe('statistiques d’utilisation', () => {
  let app: TestServer;
  let baseUrl: string;
  const statsPage = async (query = '') => {
    const res = await app.app.inject({
      method: 'GET',
      url: `/admin/statistiques${query}`,
      headers: { authorization: basic('antoine', 's3cret') },
    });
    return res;
  };
  const text = (html: string, name: string) =>
    new RegExp(`data-stat="${name}">([^<]*)<`).exec(html)?.[1];
  beforeAll(async () => {
    ({ app, baseUrl } = await boot('s3cret'));
  });
  afterAll(async () => {
    await app.close();
  });

  it('demande les mêmes identifiants et marque le navigateur de l’exploitant', async () => {
    const refused = await app.app.inject({ method: 'GET', url: '/admin/statistiques' });
    expect(refused.statusCode).toBe(401);
    expect(refused.headers['set-cookie']).toBeUndefined();

    const res = await statsPage();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toContain(`${OBSERVER_COOKIE}=1`);
    expect(res.headers['set-cookie']).toContain('HttpOnly');
    expect(res.body).toContain('<a href="/admin">En direct</a>');
    expect(res.body).toContain('href="/admin/statistiques" aria-current="page"');
    expect(stat(res.body, 'usage-games')).toBe(0);
    // Une période inconnue retombe sur tout l'historique.
    expect((await statsPage('?periode=n-importe')).body).toContain(
      'href="/admin/statistiques" aria-current="page"',
    );
    expect((await statsPage('?periode=7')).body).toContain('?periode=7" aria-current="page"');
  });

  it('note l’écran ouvert ailleurs, sauf celui de l’hôte et celui de l’exploitant', async () => {
    const g = await createGame(baseUrl);
    const host = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    await until(() => host.connected);
    expect(app.marks.all().get(g.gameId)).toBeUndefined();

    // L'exploitant ouvre l'écran depuis /admin : son navigateur porte le cookie.
    const observer = connect(baseUrl, {
      auth: { kind: 'board', code: g.code },
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: `autre=1; ${OBSERVER_COOKIE}=1` },
    });
    await new Promise((resolve) => observer.once('snapshot', resolve));
    expect(app.marks.all().get(g.gameId)).toBeUndefined();

    // Un joueur à distance ouvre le lien partagé.
    const remote = await open(baseUrl, { kind: 'board', code: g.code });
    expect([...(app.marks.all().get(g.gameId) ?? [])]).toEqual(['remote_board']);

    for (const socket of [host, observer, remote]) socket.disconnect();
  });

  it('note le partage du lien, une fois par partie et par origine', async () => {
    const g = await createGame(baseUrl);
    const share = (from: unknown, code = g.code) =>
      app.app.inject({ method: 'POST', url: `/api/games/${code}/shared`, payload: { from } });
    expect((await share('board')).statusCode).toBe(204);
    expect((await share('board')).statusCode).toBe(204);
    expect((await share('phone')).statusCode).toBe(204);
    expect([...(app.marks.all().get(g.gameId) ?? [])].sort()).toEqual([
      'shared_board',
      'shared_phone',
    ]);
    expect((await share('tablette')).statusCode).toBe(400);
    expect((await share('board', 'ZZZZ')).statusCode).toBe(404);
  });

  it('donne le lien d’hôte à l’hôte seul, et note son affichage puis son ouverture ailleurs', async () => {
    const g = await createGame(baseUrl);
    const other = await createGame(baseUrl);
    const post = (path: string, payload: object, code = g.code) =>
      app.app.inject({ method: 'POST', url: `/api/games/${code}/${path}`, payload });
    expect((await post('host-link', {})).statusCode).toBe(400);
    expect((await post('host-link', { hostToken: 'faux' })).statusCode).toBe(403);
    // Le jeton d'hôte d'une autre partie n'ouvre pas celle-ci, ni l'inverse.
    expect((await post('host-link', { hostToken: other.hostToken })).statusCode).toBe(403);
    expect(
      (await post('host-link/opened', { hostToken: g.hostToken }, other.code)).statusCode,
    ).toBe(403);
    expect(app.marks.all().get(g.gameId)).toBeUndefined();

    const shown = await post('host-link', { hostToken: g.hostToken });
    expect(shown.statusCode).toBe(200);
    expect(shown.headers['cache-control']).toBe('no-store');
    const link = shown.json<HostLink>();
    // Le jeton après le # : le navigateur qui ouvre le lien ne l'envoie pas dans l'adresse.
    expect(link.url).toBe(`https://navale.test/host/${g.code}#${g.hostToken}`);
    expect(link.qr).toContain('<svg');
    expect([...(app.marks.all().get(g.gameId) ?? [])]).toEqual(['host_link']);

    // Le code se tape aussi en minuscules ; ouvrir deux fois ne note qu'une fois.
    expect(
      (await post('host-link/opened', { hostToken: g.hostToken }, g.code.toLowerCase())).statusCode,
    ).toBe(204);
    expect((await post('host-link/opened', { hostToken: g.hostToken })).statusCode).toBe(204);
    expect([...(app.marks.all().get(g.gameId) ?? [])].sort()).toEqual(['host_link', 'host_moved']);
  });

  it('compte une partie lancée contre un bot, partagée et ouverte ailleurs', async () => {
    const g = await createGame(baseUrl);
    const board = await open(baseUrl, { kind: 'board', code: g.code, hostToken: g.hostToken });
    const me = await open(baseUrl, { kind: 'join', code: g.code });
    expect((await command(me, { type: 'JOIN_GAME', name: 'Julie', color: 'teal' })).ok).toBe(true);
    expect((await command(board, { type: 'ADD_BOT' })).ok).toBe(true);
    const bot = app.registry.get(g.gameId)!.state.players.find((p) => p.kind === 'bot')!;
    const ships = bot.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }));
    expect((await command(me, { type: 'PLACE_FLEET', ships })).ok).toBe(true);
    expect((await command(me, { type: 'SET_READY', ready: true })).ok).toBe(true);
    await app.app.inject({
      method: 'POST',
      url: `/api/games/${g.code}/shared`,
      payload: { from: 'board' },
    });
    const remote = await open(baseUrl, { kind: 'board', code: g.code });
    for (const path of ['host-link', 'host-link/opened'])
      await app.app.inject({
        method: 'POST',
        url: `/api/games/${g.code}/${path}`,
        payload: { hostToken: g.hostToken },
      });
    expect((await command(board, { type: 'START_GAME' })).ok).toBe(true);

    const html = (await statsPage()).body;
    expect(stat(html, 'usage-games')).toBe(1);
    expect(text(html, 'usage-humans')).toBe('50 %');
    expect(text(html, 'usage-remote')).toBe('100 %');
    expect(text(html, 'usage-shared')).toBe('100 %');
    expect(text(html, 'usage-host-moved')).toBe('100 %');
    expect(text(html, 'usage-host-link')).toBe('100 %');
    expect(html).toContain('Tour par tour · classique 10×10 · 2 joueurs · sans commandants');

    for (const socket of [board, me, remote]) socket.disconnect();
  });
});
