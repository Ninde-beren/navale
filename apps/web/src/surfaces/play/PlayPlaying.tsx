import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { coordLabel, type PlayerView } from '@navale/protocol';
import { ownGridClasses } from '../../shared/cells.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';

const RESULT = { MISS: 'RATÉ', HIT: 'TOUCHÉ', SUNK: 'COULÉ' } as const;

/**
 * Téléphone pendant la partie. Jalon M2 : ma grille, mes dégâts, l'état du tour.
 * Le choix de la cible et le tir arrivent au jalon M3.
 */
export function PlayPlaying({ view }: { view: PlayerView; socket: RefObject<Socket | null> }) {
  const me = view.players.find((p) => p.playerId === view.me.playerId)!;
  const active = view.round?.activePlayerId
    ? view.players.find((p) => p.playerId === view.round?.activePlayerId)
    : undefined;
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? '?';
  const headline =
    view.status === 'FINISHED'
      ? me.rank === 1
        ? 'Victoire !'
        : `${me.rank ?? '?'}e sur ${view.players.length}`
      : me.status === 'ELIMINATED'
        ? 'Tu es éliminé'
        : view.me.canFire
          ? 'À toi'
          : active
            ? `Au tour de ${active.name}`
            : 'Regarde l’écran';
  return (
    <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 16 }}>
      <div className="flex items-center justify-between">
        <Wordmark />
        <span className="chip plain">{view.code}</span>
      </div>
      <div>
        <h1 className={`state ${view.me.canFire ? 'me' : ''}`}>{headline}</h1>
        <p className="muted">
          Manche {(view.round?.index ?? 0) + 1} · {view.me.cellsRemaining} cases intactes
          {view.me.canFire && ' · le tir arrive au jalon M3'}
        </p>
      </div>
      <div className="flex justify-center">
        <Grid
          width={view.settings.grid.width}
          height={view.settings.grid.height}
          cellClass={ownGridClasses(view.me.fleet, me.revealed)}
          label="Ma flotte"
          className={me.status === 'ELIMINATED' ? 'dim' : ''}
        />
      </div>
      <div className="panel flex flex-col gap-2">
        <span className="label">Mes derniers tirs</span>
        {[...view.me.shotsFired]
          .reverse()
          .slice(0, 5)
          .map((s, i) => (
            <div key={i} className="kv">
              <span>
                {name(s.targetId)} · {coordLabel(s.coord)}
              </span>
              <b className={`res ${s.result.toLowerCase()}`}>{RESULT[s.result]}</b>
            </div>
          ))}
        {view.me.shotsFired.length === 0 && <p className="hint">Aucun tir pour l'instant.</p>}
      </div>
    </div>
  );
}
