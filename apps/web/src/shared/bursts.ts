import { sameCoord } from '@navale/engine';
import type { ResolvedShot, ShotResult } from '@navale/protocol';

/** Une ligne de journal : un tir, ou une rafale de missile résumée en un seul coup. */
export type LogEntry = ResolvedShot & {
  /** Rafale : son nombre de tirs ; la ligne porte son centre et son verdict. */
  burstSize?: number;
};

/** Le verdict d'une rafale : coulé si elle achève un bateau, touché si un tir touche, sinon raté. */
export function burstResult(shots: ReadonlyArray<{ result: ShotResult }>): ShotResult {
  if (shots.some((s) => s.result === 'SUNK')) return 'SUNK';
  return shots.some((s) => s.result === 'HIT') ? 'HIT' : 'MISS';
}

/** Deux tirs consécutifs de la même rafale : même manche, même tireur, même centre. */
export function sameBurst(a: ResolvedShot | undefined, b: ResolvedShot): boolean {
  return (
    a?.burst !== undefined &&
    b.burst !== undefined &&
    a.round === b.round &&
    a.shooterId === b.shooterId &&
    sameCoord(a.burst.center, b.burst.center)
  );
}

/**
 * Les tirs, chaque rafale de missile regroupée en une seule ligne, dans l'ordre :
 * la ligne d'une rafale porte son centre, son verdict et son nombre de tirs.
 */
export function groupBursts(shots: ResolvedShot[]): LogEntry[] {
  const out: LogEntry[] = [];
  let group: ResolvedShot[] = [];
  const flush = () => {
    const first = group[0];
    if (first?.burst)
      out.push({
        ...first,
        coord: first.burst.center,
        result: burstResult(group),
        burstSize: group.length,
      });
    group = [];
  };
  for (const shot of shots) {
    if (shot.burst && sameBurst(group.at(-1), shot)) {
      group.push(shot);
      continue;
    }
    flush();
    if (shot.burst) group = [shot];
    else out.push(shot);
  }
  flush();
  return out;
}
