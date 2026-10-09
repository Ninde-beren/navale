import { describe, expect, it } from 'vitest';
import { boardUrl, playUrl, shareMessage, shortUrl } from '../src/shared/share.js';

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
