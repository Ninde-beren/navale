import type {
  EndCondition,
  RankEntry,
  SalvoOrder,
  ShipSpec,
  ShotResult,
  SunkReveal,
  Variant,
} from '@navale/protocol';

/*
 * Les mots de l'interface, en un seul endroit : la création, le lobby, la partie
 * et la fin disent la même chose de la même façon.
 */

export const VARIANT_LABELS: Record<Variant, string> = {
  sequential: 'Tour par tour',
  simultaneous: 'Salve',
};

export const END_LABELS: Record<EndCondition, string> = {
  last_standing: 'Dernier survivant',
  first_fleet_sunk: 'Première flotte coulée',
};

export const SALVO_ORDER_LABELS: Record<SalvoOrder, string> = {
  commit: 'Le plus rapide d’abord',
  seats: 'Ordre des sièges',
};

export const SUNK_REVEAL_LABELS: Record<SunkReveal, string> = {
  classic: 'Cases révélées',
  secret: 'Seulement « coulé »',
};

export const RESULT_LABELS: Record<ShotResult, string> = {
  MISS: 'RATÉ',
  HIT: 'TOUCHÉ',
  SUNK: 'COULÉ',
};

/** Les types de bateaux des presets ; un type inconnu s'affiche tel quel. */
const SHIP_LABELS: Readonly<Record<string, string>> = {
  carrier: 'Porte-avions',
  cruiser: 'Croiseur',
  destroyer: 'Contre-torpilleur',
  torpedo: 'Torpilleur',
};

export function shipLabel(type: string): string {
  return SHIP_LABELS[type] ?? type;
}

/** « Croiseur 4, Contre-torpilleur 3, Torpilleur 2 ». */
export function fleetSummary(fleet: ShipSpec[]): string {
  return fleet.map((s) => `${shipLabel(s.type)} ${s.size}`).join(', ');
}

/** Les options d'un sélecteur, dans l'ordre des libellés. */
export function choices<T extends string>(labels: Record<T, string>): Array<[T, string]> {
  return Object.entries(labels) as Array<[T, string]>;
}

/** « 1er », « 2e », « 3e »… */
export function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

/** « 1 bateau », « 3 bateaux ». */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n > 1 ? plural : singular}`;
}

/** Les statistiques de fin de partie, dans l'ordre où on les montre. */
export const STATS: Array<{ label: string; value: (entry: RankEntry) => string | number }> = [
  { label: 'Tirs', value: (r) => r.shotsFired },
  { label: 'Touches', value: (r) => r.hits },
  { label: 'Précision', value: (r) => `${Math.round(r.accuracy * 100)} %` },
  { label: 'Coulés', value: (r) => r.shipsSunk },
];
