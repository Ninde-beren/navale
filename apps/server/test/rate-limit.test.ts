import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { GAME_CREATION_LIMIT } from '../src/http/games.js';

let server: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  server = await createApp(
    { port: 0, dataDir: '/tmp', publicUrl: 'https://navale.test', logLevel: 'silent' },
    ':memory:',
  );
});
afterAll(async () => {
  await server.close();
});

/** Adresse du conteneur Caddy sur le réseau Docker privé. */
const CADDY = '172.18.0.5';

/** Crée une partie depuis `remoteAddress`, éventuellement à travers un proxy. */
function createGame(remoteAddress: string, forwardedFor?: string) {
  return server.app.inject({
    method: 'POST',
    url: '/api/games',
    remoteAddress,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    payload: { settings: { variant: 'sequential', maxPlayers: 2 } },
  });
}

/** Épuise le quota de création de l'adresse, en vérifiant que chaque partie passe. */
async function useUpQuota(remoteAddress: string, forwardedFor?: (i: number) => string) {
  for (let i = 0; i < GAME_CREATION_LIMIT.max; i++)
    expect((await createGame(remoteAddress, forwardedFor?.(i))).statusCode).toBe(201);
}

describe('limite de création de parties', () => {
  it('refuse au-delà du quota, avec une erreur au format de l’API', async () => {
    await useUpQuota('198.51.100.1');

    const refused = await createGame('198.51.100.1');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(refused.json().message).toMatch(/^Trop de demandes .* Réessaie dans \d+ min\.$/);
    expect(refused.headers['retry-after']).toBeDefined();
  });

  it('compte par joueur derrière Caddy, pas pour Caddy tout entier', async () => {
    await useUpQuota(CADDY, () => '203.0.113.7');

    expect((await createGame(CADDY, '203.0.113.7')).statusCode).toBe(429);
    expect((await createGame(CADDY, '203.0.113.8')).statusCode).toBe(201);
  });

  it('ignore un X-Forwarded-For envoyé directement depuis Internet', async () => {
    // Une adresse inventée à chaque requête ne suffit pas à repartir de zéro.
    await useUpQuota('198.51.100.2', (i) => `192.0.2.${i}`);

    expect((await createGame('198.51.100.2', '192.0.2.200')).statusCode).toBe(429);
  });

  it('ne limite pas les autres routes', async () => {
    await useUpQuota('198.51.100.3');

    const health = await server.app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '198.51.100.3',
    });
    expect(health.statusCode).toBe(200);
  });
});
