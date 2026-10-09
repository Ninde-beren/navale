import { GAME_CODE_ALPHABET, GAME_CODE_LENGTH, GAME_CODE_PATTERN } from '@navale/protocol';

/**
 * Code de partie lu dans un QR code : l'URL de l'écran central
 * (`…/play/ABCD`, quel que soit le domaine) ou un code nu.
 */
export function codeFromQr(text: string): string | null {
  const url = new RegExp(`/play/(${GAME_CODE_PATTERN})(?:[/?#]|$)`, 'i').exec(text);
  if (url) return url[1]!.toUpperCase();
  const bare = new RegExp(`^\\s*(${GAME_CODE_PATTERN})\\s*$`, 'i').exec(text);
  return bare ? bare[1]!.toUpperCase() : null;
}

/** La caméra n'est proposée que si le navigateur sait l'ouvrir (contexte sécurisé, API présente). */
export function canScan(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Ce que tape le joueur, réduit aux lettres qu'un code peut contenir. */
export function typedCode(input: string): string {
  return input
    .toUpperCase()
    .replace(new RegExp(`[^${GAME_CODE_ALPHABET}]`, 'g'), '')
    .slice(0, GAME_CODE_LENGTH);
}
