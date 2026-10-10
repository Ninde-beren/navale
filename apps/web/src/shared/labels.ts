import type {
  Ability,
  AbilityType,
  BotLevel,
  Commander,
  Echo,
  EndCondition,
  GameSettings,
  RadarResult,
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

export const BOT_LEVEL_LABELS: Record<BotLevel, string> = {
  easy: 'Facile',
  normal: 'Normal',
  hard: 'Difficile',
};

export const SUNK_REVEAL_LABELS: Record<SunkReveal, string> = {
  classic: 'Cases révélées',
  secret: 'Seulement « coulé »',
};

export const RESULT_LABELS: Record<ShotResult, string> = {
  MISS: 'RATÉ',
  HIT: 'TOUCHÉ',
  SUNK: 'COULÉ',
  BLOCKED: 'BLOQUÉ',
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

/** « Jamais deux fois de suite sur le même », « 2 tirs de suite au plus sur le même » ; `null` = libre. */
export function antiFocusLabel(max: number | null): string {
  if (max === null) return 'Cibles libres';
  return max === 1
    ? 'Jamais deux fois de suite sur le même'
    : `${max} tirs de suite au plus sur le même`;
}

export const ABILITY_LABELS: Record<AbilityType, string> = {
  radar: 'Radar',
  sonar: 'Sonar',
  missile: 'Missile',
  repair: 'Réparation',
  shield: 'Bouclier',
  decoy: 'Leurre',
};

/** Ce que fait la capacité, en une phrase. */
export function abilityHint(ability: Ability): string {
  switch (ability.type) {
    case 'radar':
      return `Révèle, pour toi seul et sans tirer, les cases de navire d’une zone de ${ability.size} × ${ability.size}.`;
    case 'sonar':
      return `Écoute, pour toi seul et sans tirer, une zone de ${ability.size} × ${ability.size} : un écho faible, moyen ou fort dit à peu près combien de cases de navire s’y cachent, mais pas lesquelles.`;
    case 'missile':
      return 'Frappe une case et ses quatre voisines d’un coup.';
    case 'repair':
      return 'Remet en état une case touchée d’un bateau encore à flot.';
    case 'shield':
      return `Protège une zone de ${ability.size} × ${ability.size} de ta flotte pour toute la partie : chaque case arrête le premier tir qui la vise.`;
    case 'decoy':
      return 'Pose en secret un faux navire sur une case vide : le premier tir dessus est annoncé « touché », sans rien abîmer.';
  }
}

/** Les commandants de la partie ; les journaux d'avant ce réglage n'en ont pas. */
export function commandersOf(settings: GameSettings): Commander[] {
  return settings.commanders ?? [];
}

export function commanderOf(settings: GameSettings, id: string | null): Commander | undefined {
  return id === null ? undefined : commandersOf(settings).find((c) => c.id === id);
}

/** « Amiral · Radar ». */
export function commanderLabel(commander: Commander): string {
  return `${commander.name} · ${ABILITY_LABELS[commander.ability.type]}`;
}

/** « Bot après 45 s d'absence » ; `null` = on attend l'absent. */
export function afkBotLabel(seconds: number | null): string {
  return seconds === null ? 'On attend les absents' : `Bot après ${seconds} s d’absence`;
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

const ECHO_LABELS: Record<Echo['level'], string> = {
  weak: 'faible',
  medium: 'moyen',
  strong: 'fort',
};

/**
 * Ce qu'une détection a trouvé : « 3 cases de navire » pour un radar (ou un sonar d'avant
 * l'écho), « écho moyen : 2 à 4 cases de navire » pour un sonar.
 */
export function detectionFound(result: RadarResult): string {
  if (!result.echo) return `${count(result.shipCells ?? 0, 'case')} de navire`;
  const { level, min, max } = result.echo;
  const found =
    max === null
      ? `${min} cases de navire ou plus`
      : `${min} ${max === min + 1 ? 'ou' : 'à'} ${count(max, 'case')} de navire`;
  return `écho ${ECHO_LABELS[level]} : ${found}`;
}

/** La même chose en court, pour une ligne de liste : « 3 cases de navire », « écho moyen (2–4) ». */
export function detectionBrief(result: RadarResult): string {
  if (!result.echo) return detectionFound(result);
  const { level, min, max } = result.echo;
  return `écho ${ECHO_LABELS[level]} (${max === null ? `${min}+` : `${min}–${max}`})`;
}

/** Les statistiques de fin de partie, dans l'ordre où on les montre. */
export const STATS: Array<{ label: string; value: (entry: RankEntry) => string | number }> = [
  { label: 'Tirs', value: (r) => r.shotsFired },
  { label: 'Touches', value: (r) => r.hits },
  { label: 'Précision', value: (r) => `${Math.round(r.accuracy * 100)} %` },
  { label: 'Coulés', value: (r) => r.shipsSunk },
];
