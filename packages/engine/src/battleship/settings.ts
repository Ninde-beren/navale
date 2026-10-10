import type { Commander, GameSettings, PresetId, ShipSpec, Variant } from '@navale/protocol';

/**
 * Les commandants proposés quand l'hôte les active : une capacité chacun, une fois
 * par partie. Ce ne sont que des valeurs par défaut de `settings.commanders`.
 */
export const COMMANDERS: readonly Commander[] = [
  { id: 'amiral', name: 'Amiral', ability: { type: 'radar', size: 3 }, uses: 1 },
  {
    id: 'sonariste',
    name: 'Sonariste',
    // Écho faible de 0 à 1 case de navire, moyen de 2 à 4, fort à partir de 5.
    ability: { type: 'sonar', size: 5, echo: { medium: 2, strong: 5 } },
    uses: 1,
  },
  { id: 'artificier', name: 'Artificier', ability: { type: 'missile', pattern: 'cross' }, uses: 1 },
  { id: 'ingenieur', name: 'Ingénieur', ability: { type: 'repair' }, uses: 1 },
  { id: 'capitaine', name: 'Capitaine', ability: { type: 'shield', size: 3 }, uses: 1 },
  { id: 'espion', name: 'Espion', ability: { type: 'decoy' }, uses: 1 },
];

/** Présélections de grille et de flotte. Ce ne sont que des valeurs par défaut de `settings`. */
export const PRESETS: Readonly<Record<PresetId, Pick<GameSettings, 'grid' | 'fleet'>>> = {
  classic: {
    grid: { width: 10, height: 10 },
    fleet: [
      { type: 'carrier', size: 5 },
      { type: 'cruiser', size: 4 },
      { type: 'destroyer', size: 3 },
      { type: 'destroyer', size: 3 },
      { type: 'torpedo', size: 2 },
    ],
  },
  quick: {
    grid: { width: 8, height: 8 },
    fleet: [
      { type: 'cruiser', size: 4 },
      { type: 'destroyer', size: 3 },
      { type: 'destroyer', size: 3 },
      { type: 'torpedo', size: 2 },
    ],
  },
};

/** Preset par défaut selon le nombre de joueurs : classique à 2, rapide à 3 et 4. */
export function defaultPresetFor(maxPlayers: number): PresetId {
  return maxPlayers <= 2 ? 'classic' : 'quick';
}

/** Les réglages qui ne dépendent ni de la variante, ni du nombre de joueurs, ni du preset. */
const DEFAULTS = {
  endCondition: 'last_standing',
  sunkReveal: 'classic',
  shipsMayTouch: true,
  roundTimerSeconds: null,
  revealDelayMs: 2500,
  salvoOrder: 'commit',
  antiFocusMaxStreak: null,
  afkBotSeconds: 45,
  afkBotLevel: 'normal',
  commanders: [],
} satisfies Partial<GameSettings>;

export function makeSettings(
  partial: Partial<GameSettings> & { variant: Variant; maxPlayers: number },
  preset: PresetId = defaultPresetFor(partial.maxPlayers),
): GameSettings {
  return { ...DEFAULTS, ...PRESETS[preset], ...partial };
}

/**
 * Complète des réglages journalisés avant qu'un réglage existe : un ancien journal
 * se rejoue avec les valeurs d'alors (pas de commandants, on attend les absents),
 * jamais avec un champ manquant.
 */
const LEGACY_DEFAULTS: Partial<GameSettings> = { ...DEFAULTS, afkBotSeconds: null };

export function normalizeSettings(settings: GameSettings): GameSettings {
  return { ...LEGACY_DEFAULTS, ...settings };
}

/** Règles de cohérence que Zod ne porte pas (relations entre champs). */
export function validateSettings(s: GameSettings): string[] {
  const errors: string[] = [];
  const { width, height } = s.grid;
  const maxSize = Math.min(width, height);
  const sizesByType = new Map<string, number>();
  let total = 0;
  s.fleet.forEach((spec: ShipSpec, i) => {
    total += spec.size;
    if (spec.size > maxSize)
      errors.push(`bateau ${i} (${spec.type}) : taille ${spec.size} > ${maxSize}`);
    const known = sizesByType.get(spec.type);
    if (known !== undefined && known !== spec.size)
      errors.push(`type ${spec.type} : tailles différentes (${known} et ${spec.size})`);
    sizesByType.set(spec.type, spec.size);
  });
  if (total > (width * height) / 2)
    errors.push(`flotte trop grande : ${total} cases pour une grille de ${width * height}`);
  const ids = s.commanders.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push('commandants : identifiants en double');
  for (const { id, ability } of s.commanders)
    if (ability.type === 'sonar' && ability.echo && ability.echo.medium >= ability.echo.strong)
      errors.push(`commandant ${id} : l'écho moyen doit commencer avant l'écho fort`);
  return errors;
}
