import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RateLimiter, feedbackMail } from '../src/http/feedback.js';
import type { Mail, Mailer } from '../src/mail/mailer.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé');
    await sleep(10);
  }
}

/** Un transport qui garde les mails en mémoire, ou qui tombe en panne. */
function fakeMailer(failing = false): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    to: 'antoine@navale.test',
    sent,
    verify: async () => {},
    async send(mail) {
      if (failing) throw new Error('SMTP en panne');
      sent.push(mail);
    },
  };
}

type App = Awaited<ReturnType<typeof createApp>>;
const opened: Array<{ app: App; dir: string }> = [];
async function boot(mailer: Mailer | null) {
  const dir = mkdtempSync(join(tmpdir(), 'navale-feedback-'));
  const app = await createApp(
    {
      port: 0,
      dataDir: dir,
      publicUrl: 'https://navale.test',
      logLevel: 'silent',
    },
    join(dir, 'navale.sqlite'),
    { mailer },
  );
  opened.push({ app, dir });
  return app;
}
afterEach(async () => {
  for (const { app, dir } of opened.splice(0)) {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

const body = (message: string, extra: Record<string, unknown> = {}) => ({
  message,
  email: 'lea@exemple.fr',
  context: { path: '/board/KRTX', code: 'KRTX', screen: '1366×657' },
  ...extra,
});
const post = (app: App, payload: object, headers: Record<string, string> = {}) =>
  app.app.inject({
    method: 'POST',
    url: '/api/feedback',
    headers: { 'user-agent': 'Vitest/1.0', ...headers },
    payload,
  });

describe('POST /api/feedback', () => {
  it('enregistre le retour puis l’envoie par mail avec son contexte', async () => {
    const mailer = fakeMailer();
    const app = await boot(mailer);
    const res = await post(app, body('Le callout cache la grille à trois joueurs.'));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ ok: true, id: 1, mail: 'queued' });

    await until(() => mailer.sent.length === 1);
    const mail = mailer.sent[0]!;
    expect(mail.subject).toBe('Navale · retour depuis /board/KRTX · partie KRTX');
    expect(mail.replyTo).toBe('lea@exemple.fr');
    expect(mail.text).toContain('Le callout cache la grille à trois joueurs.');
    expect(mail.text).toContain('Page : https://navale.test/board/KRTX');
    expect(mail.text).toContain('Écran : 1366×657');
    expect(mail.text).toContain('Navigateur : Vitest/1.0');

    await until(() => app.store.recentFeedback()[0]?.sentAt !== null);
    const [record] = app.store.recentFeedback();
    expect(record).toMatchObject({
      id: 1,
      message: 'Le callout cache la grille à trois joueurs.',
      email: 'lea@exemple.fr',
      path: '/board/KRTX',
      code: 'KRTX',
      userAgent: 'Vitest/1.0',
    });
  });

  it('garde le retour en base quand le mail ne part pas', async () => {
    const app = await boot(fakeMailer(true));
    const res = await post(app, body('Rien ne se perd.'));
    expect(res.statusCode).toBe(202);
    await sleep(50);
    expect(app.store.recentFeedback()).toHaveLength(1);
    expect(app.store.recentFeedback()[0]?.sentAt).toBeNull();
  });

  it('fonctionne sans SMTP : le retour reste en base, anonyme si aucune adresse', async () => {
    const app = await boot(null);
    const res = await post(app, body('Un mot <b>gras</b> & une idée.', { email: '' }));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ mail: 'off' });
    const [record] = app.store.recentFeedback();
    expect(record?.email).toBeNull();
    expect(record?.message).toBe('Un mot <b>gras</b> & une idée.');
    expect(record?.sentAt).toBeNull();
    expect(app.store.countFeedback()).toBe(1);
  });

  it('refuse un message vide, trop long ou une adresse invalide', async () => {
    const app = await boot(fakeMailer());
    expect((await post(app, body('ok'))).statusCode).toBe(400);
    expect((await post(app, body('x'.repeat(2001)))).statusCode).toBe(400);
    expect((await post(app, body('Bonjour', { email: 'pas-une-adresse' }))).statusCode).toBe(400);
    expect((await post(app, { message: 'Bonjour' })).statusCode).toBe(400);
    expect(app.store.recentFeedback()).toHaveLength(0);
  });

  it('limite à cinq retours par adresse, d’après le reverse proxy', async () => {
    const app = await boot(fakeMailer());
    for (let i = 0; i < 5; i++) {
      const res = await post(app, body(`Retour ${i}`), { 'x-forwarded-for': '203.0.113.7' });
      expect(res.statusCode).toBe(202);
    }
    const blocked = await post(app, body('Retour de trop'), { 'x-forwarded-for': '203.0.113.7' });
    expect(blocked.statusCode).toBe(429);
    const other = await post(app, body('Autre table'), { 'x-forwarded-for': '203.0.113.8' });
    expect(other.statusCode).toBe(202);
    // Une adresse inventée en tête de l'en-tête ne compte pas : seule la dernière, posée par le proxy, fait foi.
    const spoofed = await post(app, body('Encore moi'), {
      'x-forwarded-for': '198.51.100.1, 203.0.113.7',
    });
    expect(spoofed.statusCode).toBe(429);
    expect(app.store.recentFeedback()).toHaveLength(6);
  });
});

describe('RateLimiter', () => {
  it('oublie les passages hors fenêtre', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 100)).toBe(true);
    expect(limiter.allow('a', 200)).toBe(false);
    expect(limiter.allow('a', 1100)).toBe(true);
    expect(limiter.allow('b', 200)).toBe(true);
  });
});

describe('feedbackMail', () => {
  it('décrit un retour anonyme sans adresse de réponse', () => {
    const mail = feedbackMail(
      {
        id: 7,
        at: Date.UTC(2026, 9, 9, 10, 30),
        message: 'Bravo.',
        email: null,
        path: '/create',
        code: null,
        screen: null,
        userAgent: null,
        version: 'abc1234',
        sentAt: null,
      },
      'https://navale.test',
    );
    expect(mail.subject).toBe('Navale · retour depuis /create');
    expect(mail.replyTo).toBeUndefined();
    expect(mail.text).toContain('De : anonyme');
    expect(mail.text).toContain('Version : abc1234 · retour nº 7');
  });
});
