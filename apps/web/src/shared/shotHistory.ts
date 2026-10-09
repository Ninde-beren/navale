import { useMemo, useRef } from 'react';
import type { ResolvedShot } from '@navale/protocol';

const key = (s: ResolvedShot) => `${s.round}:${s.shooterId}:${s.coord.x},${s.coord.y}`;

/** `previous` complété des tirs de `latest` qu'il n'avait pas, limité aux `limit` derniers. */
export function mergeShots(
  previous: ResolvedShot[],
  latest: ResolvedShot[],
  limit: number,
): ResolvedShot[] {
  const seen = new Set(previous.map(key));
  const fresh = latest.filter((s) => !seen.has(key(s)));
  return fresh.length === 0 ? previous : [...previous, ...fresh].slice(-limit);
}

/**
 * Les derniers tirs vus par cet écran. La vue ne porte que la dernière manche
 * (`lastShots`) ; on garde celles reçues depuis l'ouverture, jusqu'à `limit`
 * tirs. Un rechargement repart de la dernière manche : l'instantané ne rejoue
 * pas le journal.
 */
export function useShotHistory(
  lastShots: ResolvedShot[],
  gameId: string,
  limit: number,
): ResolvedShot[] {
  const kept = useRef<{ gameId: string; shots: ResolvedShot[] }>({ gameId, shots: [] });
  return useMemo(() => {
    if (kept.current.gameId !== gameId) kept.current = { gameId, shots: [] };
    kept.current.shots = mergeShots(kept.current.shots, lastShots, limit);
    return kept.current.shots;
  }, [lastShots, gameId, limit]);
}
