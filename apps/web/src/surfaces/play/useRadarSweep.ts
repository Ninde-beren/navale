import { useEffect, useRef, useState } from 'react';
import type { RadarResult } from '@navale/protocol';
import { RADAR_SWEEP_MS } from '../../shared/radarSweep.js';

/** Un résultat de détection se reconnaît à sa manche et à sa cible : une capacité par manche. */
export const sameRadar = (a: RadarResult, b: RadarResult) =>
  a.round === b.round && a.targetId === b.targetId;
const keyOf = (r: RadarResult) => `${r.round}-${r.targetId}`;

/**
 * Mon radar qui vient d'arriver, le temps de son balayage : la grille de la cible
 * allume ses échos au passage du rayon, puis les garde. Un résultat ne se balaie
 * qu'une fois, sur le premier écran qui le montre ; ceux qui étaient déjà là au
 * montage (rechargement, reconnexion) ne se rejouent pas. Le sonar ne dit pas où :
 * il ne balaie pas. Rien de nouveau ne vient du serveur, c'est ma vue privée qui s'anime.
 */
export function useRadarSweep(results: RadarResult[]): RadarResult | null {
  const swept = useRef<Set<string> | null>(null);
  swept.current ??= new Set(results.map(keyOf));
  const [playing, setPlaying] = useState<RadarResult | null>(null);
  const latest = results.at(-1);
  const fresh = latest?.contacts && !swept.current.has(keyOf(latest)) ? latest : null;

  useEffect(() => {
    if (!fresh) return;
    swept.current?.add(keyOf(fresh));
    setPlaying(fresh);
  }, [fresh]);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setPlaying(null), RADAR_SWEEP_MS);
    return () => clearTimeout(timer);
  }, [playing]);

  // Dès le rendu qui le découvre : sinon ses marques s'afficheraient un instant avant le rayon.
  return playing ?? fresh;
}
