import { z } from 'zod';

/** Lettres des codes de partie : l'alphabet sans I ni O, qu'on confondrait avec 1 et 0. */
export const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const GAME_CODE_LENGTH = 4;

/** Motif d'un code, sans ancres : pour le reconnaître aussi dans une adresse (`/play/ABCD`). */
export const GAME_CODE_PATTERN = `[${GAME_CODE_ALPHABET}]{${GAME_CODE_LENGTH}}`;

export const GameCodeSchema = z.string().regex(new RegExp(`^${GAME_CODE_PATTERN}$`));

/** Un code tel qu'un joueur le saisit ou le scanne, remis en forme : sans espaces, en majuscules. */
export function normalizeGameCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isGameCode(code: string): boolean {
  return GameCodeSchema.safeParse(code).success;
}
