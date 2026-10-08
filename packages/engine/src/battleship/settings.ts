import type { GameSettings, PresetId, ShipSpec, Variant } from '@navale/protocol';

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

export function makeSettings(
  partial: Partial<GameSettings> & { variant: Variant; maxPlayers: number },
  preset: PresetId = defaultPresetFor(partial.maxPlayers),
): GameSettings {
  return {
    endCondition: 'last_standing',
    sunkReveal: 'classic',
    shipsMayTouch: true,
    roundTimerSeconds: null,
    revealDelayMs: 2500,
    salvoOrder: 'commit',
    ...PRESETS[preset],
    ...partial,
  };
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
  return errors;
}
