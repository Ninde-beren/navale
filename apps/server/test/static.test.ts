import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { PUBLIC_URL_MARK } from '../src/http/static.js';

// Un faux build web : la page avec son repère d'adresse publique, et un robots.txt.
let dir: string;
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'navale-web-'));
  writeFileSync(
    join(dir, 'index.html'),
    `<meta property="og:image" content="${PUBLIC_URL_MARK}/og-image.jpg" />`,
  );
  writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  app = await createApp(
    {
      port: 0,
      dataDir: dir,
      publicUrl: 'https://navale.test',
      logLevel: 'silent',
      webDist: dir,
    },
    join(dir, 'navale.sqlite'),
  );
});
afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('page servie et indexation', () => {
  it.each(['/', '/index.html', '/play/KRTX', '/board/KRTX'])(
    '%s renvoie la page avec une image de partage absolue',
    async (url) => {
      const res = await app.app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toContain('content="https://navale.test/og-image.jpg"');
      expect(res.body).not.toContain(PUBLIC_URL_MARK);
    },
  );

  it('dit noindex sur la page, les fichiers et l’API', async () => {
    for (const url of ['/', '/robots.txt', '/api/health', '/api/inconnue']) {
      const res = await app.app.inject({ method: 'GET', url });
      expect(res.headers['x-robots-tag'], url).toBe('noindex, nofollow');
    }
  });

  it('sert un vrai robots.txt, pas la page', async () => {
    const res = await app.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('Allow: /');
  });
});
