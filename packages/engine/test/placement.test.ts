import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/random.js';
import { cellsOf, randomFleet, validateFleet } from '../src/battleship/placement.js';
import { PRESETS, makeSettings, validateSettings } from '../src/battleship/settings.js';
import { FIXED_QUICK } from './helpers.js';

const quick = makeSettings({ variant: 'sequential', maxPlayers: 4 }, 'quick');

describe('placement', () => {
  it('accepte une flotte valide et lui donne des identifiants et des cases', () => {
    const v = validateFleet(quick, FIXED_QUICK);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.ships.map((s) => s.shipId)).toEqual(['ship-0', 'ship-1', 'ship-2', 'ship-3']);
    expect(v.ships[0]!.cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(cellsOf({ bow: { x: 2, y: 1 }, orientation: 'V' }, 3)).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ]);
  });

  it('refuse un bateau hors de la grille', () => {
    const ships = FIXED_QUICK.map((s, i) => (i === 0 ? { ...s, bow: { x: 6, y: 0 } } : s));
    const v = validateFleet(quick, ships);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors).toEqual([{ reason: 'OUT_OF_BOUNDS', ships: [0] }]);
  });

  it('refuse deux bateaux qui se chevauchent', () => {
    const ships = FIXED_QUICK.map((s, i) => (i === 1 ? { ...s, bow: { x: 1, y: 0 } } : s));
    const v = validateFleet(quick, ships);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors).toEqual([{ reason: 'OVERLAP', ships: [0, 1] }]);
  });

  it('refuse une composition incorrecte (bateau manquant, en trop ou de mauvais type)', () => {
    for (const ships of [
      FIXED_QUICK.slice(1),
      [...FIXED_QUICK, FIXED_QUICK[3]!],
      [...FIXED_QUICK.slice(0, 3), { ...FIXED_QUICK[3]!, type: 'carrier' }],
    ]) {
      const v = validateFleet(quick, ships);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.errors[0]!.reason).toBe('WRONG_COMPOSITION');
    }
  });

  it('accepte deux bateaux du même type (deux contre-torpilleurs)', () => {
    expect(PRESETS.classic.fleet.filter((s) => s.type === 'destroyer')).toHaveLength(2);
    expect(validateFleet(quick, FIXED_QUICK).ok).toBe(true);
  });

  it('interdit le contact seulement si shipsMayTouch est faux', () => {
    const touching = [
      { type: 'cruiser', bow: { x: 0, y: 0 }, orientation: 'H' as const },
      { type: 'destroyer', bow: { x: 0, y: 1 }, orientation: 'H' as const },
      { type: 'destroyer', bow: { x: 0, y: 4 }, orientation: 'H' as const },
      { type: 'torpedo', bow: { x: 0, y: 6 }, orientation: 'H' as const },
    ];
    expect(validateFleet(quick, touching).ok).toBe(true);
    const strict = validateFleet({ ...quick, shipsMayTouch: false }, touching);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.errors).toEqual([{ reason: 'TOUCHING', ships: [0, 1] }]);
  });

  it('place une flotte aléatoire valide, identique pour une même graine', () => {
    const a = randomFleet(quick, mulberry32(42));
    const b = randomFleet(quick, mulberry32(42));
    expect(a).toEqual(b);
    expect(validateFleet(quick, a).ok).toBe(true);
    expect(a.map((s) => s.type)).toEqual(quick.fleet.map((s) => s.type));
  });

  it('place une flotte aléatoire valide sans contact sur 300 graines, classique et rapide', () => {
    const classic = makeSettings({ variant: 'sequential', maxPlayers: 2 }, 'classic');
    for (let seed = 1; seed <= 300; seed++) {
      for (const s of [
        quick,
        classic,
        { ...classic, shipsMayTouch: false },
        { ...quick, shipsMayTouch: false },
      ]) {
        expect(validateFleet(s, randomFleet(s, mulberry32(seed))).ok).toBe(true);
      }
    }
  });

  it('valide la cohérence des paramètres', () => {
    expect(validateSettings(quick)).toEqual([]);
    expect(validateSettings({ ...quick, fleet: [{ type: 'x', size: 9 }] })).toHaveLength(1);
    expect(
      validateSettings({
        ...quick,
        fleet: [
          { type: 'a', size: 3 },
          { type: 'a', size: 4 },
        ],
      }),
    ).toHaveLength(1);
    expect(
      validateSettings({
        ...quick,
        grid: { width: 6, height: 6 },
        fleet: Array(8).fill({ type: 'a', size: 5 }),
      }).length,
    ).toBeGreaterThan(0);
  });
});
