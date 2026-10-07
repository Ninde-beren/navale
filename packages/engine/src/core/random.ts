/** Générateur déterministe (mulberry32) : même graine, même partie. Utilisé par les tests et les bots. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier dans `[0, n)`. */
export function randomInt(random: () => number, n: number): number {
  return Math.min(n - 1, Math.floor(random() * n));
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: liste vide');
  return items[randomInt(random, items.length)] as T;
}
