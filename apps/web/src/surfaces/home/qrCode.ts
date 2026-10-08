const CODE = '[A-HJ-NP-Z]{4}';

/**
 * Code de partie lu dans un QR code : l'URL de l'écran central
 * (`…/play/ABCD`, quel que soit le domaine) ou un code nu.
 */
export function codeFromQr(text: string): string | null {
  const url = new RegExp(`/play/(${CODE})(?:[/?#]|$)`, 'i').exec(text);
  if (url) return url[1]!.toUpperCase();
  const bare = new RegExp(`^\\s*(${CODE})\\s*$`, 'i').exec(text);
  return bare ? bare[1]!.toUpperCase() : null;
}

/** La caméra n'est proposée que si le navigateur sait l'ouvrir (contexte sécurisé, API présente). */
export function canScan(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}
