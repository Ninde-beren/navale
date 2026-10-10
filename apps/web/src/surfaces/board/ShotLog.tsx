import { coordLabel, type PublicPlayer, type ResolvedShot } from '@navale/protocol';
import { groupBursts } from '../../shared/bursts.js';
import { RESULT_LABELS } from '../../shared/labels.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';

/**
 * Les tirs de la dernière manche, du plus récent au plus ancien ; une rafale de missile
 * tient sur une ligne, à son centre, avec son verdict. `limit` garde les dernières lignes.
 */
export function ShotLog({
  shots,
  playerOf,
  limit,
}: {
  shots: ResolvedShot[];
  playerOf: (playerId: string) => PublicPlayer | undefined;
  limit?: number;
}) {
  const entries = groupBursts(shots);
  const shown = limit === undefined ? entries : entries.slice(-limit);
  return (
    <div className="log">
      <span className="label">Derniers tirs</span>
      {[...shown].reverse().map((shot) => {
        const shooter = playerOf(shot.shooterId);
        const target = playerOf(shot.targetId);
        return (
          <div key={`${shot.round}-${shot.shooterId}-${coordLabel(shot.coord)}`} className="row">
            {shooter && <PlayerAvatar player={shooter} size="sm" />}
            <span className="who">{shooter?.name ?? '?'}</span>
            <span className="arrow">→</span>
            {target && <PlayerAvatar player={target} size="sm" />}
            <span className="who">{target?.name ?? '?'}</span>
            <span className="coord" title={shot.burstSize ? 'Rafale de missile' : undefined}>
              {shot.burstSize ? '✸' : ''}
              {coordLabel(shot.coord)}
            </span>
            <span className={`res ${shot.result.toLowerCase()}`}>{RESULT_LABELS[shot.result]}</span>
          </div>
        );
      })}
    </div>
  );
}
