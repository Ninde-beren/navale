/**
 * Rangs avec ex aequo (« 1, 1, 3 ») d'une liste déjà triée : chaque élément prend
 * sa position, sauf s'il est à égalité avec le précédent, dont il garde le rang.
 */
export function tiedRanks<T>(sorted: T[], tied: (a: T, b: T) => boolean, first = 1): number[] {
  let rank = first;
  return sorted.map((item, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && !tied(previous, item)) rank = first + i;
    return rank;
  });
}
