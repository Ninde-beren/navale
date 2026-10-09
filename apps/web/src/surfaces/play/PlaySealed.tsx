import { coordLabel, type PlayerView, type PublicPlayer } from '@navale/protocol';
import { count } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { useCommittedShooters } from '../../shared/store.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { mmss, useCountdown } from '../../shared/useCountdown.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/** Salve : mon tir est engagé, j'attends les autres (E5-S7). */
export function PlaySealed({ view, me }: { view: PlayerView; me: PublicPlayer }) {
  const { byId, nameOf } = playerLookup(view.players);
  const committed = useCommittedShooters(view.round);
  const secondsLeft = useCountdown(view.round?.deadline ?? null);
  const shooters = (view.round?.expectedShooters ?? [])
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined);
  const waitingFor = shooters.filter((p) => !committed.includes(p.playerId)).length;
  const pending = view.me.pendingShot;
  const sealedTarget = pending ? byId.get(pending.targetId) : undefined;

  return (
    <PhoneScreen code={view.code} color={me.color}>
      <div>
        <h1 className="h1">Tir engagé</h1>
        <p className="muted">
          Manche {(view.round?.index ?? 0) + 1} · Salve ·{' '}
          {waitingFor > 0 ? (
            <>
              en attente de <b style={{ color: 'var(--text)' }}>{count(waitingFor, 'joueur')}</b>
            </>
          ) : (
            'tout le monde a tiré'
          )}
        </p>
      </div>
      <div className="panel waitrow">
        <div className="waiting">
          {shooters.map((p) => {
            const fired = committed.includes(p.playerId);
            return (
              <span
                key={p.playerId}
                className={fired ? 'done' : 'pending'}
                title={`${p.name} · ${fired ? 'a tiré' : 'choisit'}`}
              >
                <PlayerAvatar player={p} size="sm" />
              </span>
            );
          })}
        </div>
        {secondsLeft !== null && (
          <div className="tright">
            <div className="mono">{mmss(secondsLeft)}</div>
            <div className="hint">avant résolution</div>
          </div>
        )}
      </div>
      {pending && (
        <div className={`panel sealed c-${sealedTarget?.color ?? me.color}`}>
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <div>
            <div className="line">
              Ton tir : <b className="mono">{coordLabel(pending.coord)}</b> sur{' '}
              <span className="pc">{nameOf(pending.targetId)}</span>
            </div>
            <div className="hint">Scellé. Personne ne le voit avant la résolution.</div>
          </div>
        </div>
      )}
      <MyFleetGrid view={view} me={me} />
      <p className="look">
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8" />
        </svg>
        La résolution se joue sur l'écran central.
      </p>
    </PhoneScreen>
  );
}
