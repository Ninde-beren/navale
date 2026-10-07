import { randomInt } from 'node:crypto';

/** 4 lettres sans I ni O : ce que les joueurs saisissent ou scannent. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function isValidCode(code: string): boolean {
  return /^[A-HJ-NP-Z]{4}$/.test(code);
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function generateCode(taken: (code: string) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    let code = '';
    for (let k = 0; k < 4; k++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken(code)) return code;
  }
  throw new Error('plus de code disponible');
}
