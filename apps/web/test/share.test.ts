import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardUrl, playUrl, reportShare, shareMessage, shortUrl } from '../src/shared/share.js';

const origin = 'https://navale.exemple.fr';

describe('partage de la partie', () => {
  it('construit les deux liens et les affiche sans protocole', () => {
    expect(boardUrl('ABCD', origin)).toBe('https://navale.exemple.fr/board/ABCD');
    expect(playUrl('ABCD', origin)).toBe('https://navale.exemple.fr/play/ABCD');
    expect(shortUrl(boardUrl('ABCD', origin))).toBe('navale.exemple.fr/board/ABCD');
  });

  it('écrit un message avec un lien par appareil', () => {
    const message = shareMessage('ABCD', origin);
    expect(message).toContain('ABCD');
    expect(message).toContain('/board/ABCD');
    expect(message).toContain('/play/ABCD');
    expect(message.split('\n')).toHaveLength(3);
  });
});

describe('mesure du partage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signale le partage au serveur, sans attendre ni gêner en cas d’échec', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('hors ligne'));
    vi.stubGlobal('fetch', fetch);
    reportShare('ABCD', 'board');
    expect(fetch).toHaveBeenCalledWith('/api/games/ABCD/shared', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'board' }),
      keepalive: true,
    });
    // Le rejet est absorbé : rien ne remonte.
    await Promise.resolve();
  });
});
