import { describe, expect, it } from 'vitest';
import type { RadarResult } from '@navale/protocol';
import { detectionBrief, detectionFound } from '../src/shared/labels.js';

const result = (over: Partial<RadarResult>): RadarResult => ({
  round: 1,
  targetId: 'b',
  center: { x: 4, y: 4 },
  size: 5,
  ability: 'sonar',
  ...over,
});

describe('ce qu’une détection a trouvé', () => {
  it('un radar, ou un sonar d’avant l’écho : le nombre de cases de navire', () => {
    expect(detectionFound(result({ ability: 'radar', shipCells: 3, contacts: [] }))).toBe(
      '3 cases de navire',
    );
    expect(detectionFound(result({ shipCells: 1 }))).toBe('1 case de navire');
  });

  it('un sonar : son écho, et la fourchette qu’il couvre', () => {
    expect(detectionFound(result({ echo: { level: 'weak', min: 0, max: 1 } }))).toBe(
      'écho faible : 0 ou 1 case de navire',
    );
    expect(detectionFound(result({ echo: { level: 'medium', min: 2, max: 4 } }))).toBe(
      'écho moyen : 2 à 4 cases de navire',
    );
    expect(detectionFound(result({ echo: { level: 'strong', min: 5, max: null } }))).toBe(
      'écho fort : 5 cases de navire ou plus',
    );
  });

  it('en court, pour la liste des détections', () => {
    expect(detectionBrief(result({ shipCells: 2 }))).toBe('2 cases de navire');
    expect(detectionBrief(result({ echo: { level: 'weak', min: 0, max: 1 } }))).toBe(
      'écho faible (0–1)',
    );
    expect(detectionBrief(result({ echo: { level: 'strong', min: 5, max: null } }))).toBe(
      'écho fort (5+)',
    );
  });
});
