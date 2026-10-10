import { describe, expect, it } from 'vitest';
import { ofName } from '../src/shared/labels.js';

describe('libellés', () => {
  it('élide « de » devant un prénom qui commence par une voyelle', () => {
    expect(ofName('Antoine')).toBe('d’Antoine');
    expect(ofName('Émile')).toBe('d’Émile');
    expect(ofName('Julie')).toBe('de Julie');
    expect(ofName('Corsaire')).toBe('de Corsaire');
  });
});
