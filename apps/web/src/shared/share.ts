import type { GameSharedRequest, ShareSource } from '@navale/protocol';

/*
 * Partage d'une partie à distance : le lien de l'écran central, à ouvrir sur un
 * ordinateur ou une tablette, et le lien pour jouer depuis un téléphone. Feuille
 * de partage native quand l'appareil en a une, sinon copie du lien de l'écran.
 */

export function boardUrl(code: string, origin = location.origin): string {
  return `${origin}/board/${code}`;
}

export function playUrl(code: string, origin = location.origin): string {
  return `${origin}/play/${code}`;
}

/** Le lien sans son protocole, tel qu'on l'affiche. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/** Le message partagé : les deux liens, chacun pour son appareil. */
export function shareMessage(code: string, origin = location.origin): string {
  return [
    `Partie Navale ${code}`,
    `Écran central, sur un ordinateur ou une tablette : ${boardUrl(code, origin)}`,
    `Pour jouer, depuis ton téléphone : ${playUrl(code, origin)}`,
  ].join('\n');
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed';

/** Feuille de partage native si l'appareil en a une, sinon copie du lien de l'écran central. */
export async function shareGame(code: string): Promise<ShareOutcome> {
  if (canShare()) {
    try {
      await navigator.share({ title: `Partie Navale ${code}`, text: shareMessage(code) });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'dismissed';
      // Partage refusé par l'appareil : on copie à la place.
    }
  }
  return (await copyText(boardUrl(code))) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dit au serveur que le partage a servi, pour les statistiques de l'exploitant (jeu sur
 * place ou à distance). Anonyme, sans réponse attendue : un échec ne gêne personne.
 */
export function reportShare(code: string, from: ShareSource): void {
  const body: GameSharedRequest = { from };
  void fetch(`/api/games/${encodeURIComponent(code)}/shared`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
