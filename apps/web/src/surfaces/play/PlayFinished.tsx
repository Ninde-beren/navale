import clsx from 'clsx';
import type { PlayerView, PublicPlayer } from '@navale/protocol';
import { STATS, ordinal } from '../../shared/labels.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/** Fin de partie, ou élimination quand la partie continue sans moi : mon rang et mes chiffres. */
export function PlayFinished({ view, me }: { view: PlayerView; me: PublicPlayer }) {
  const finished = view.status === 'FINISHED';
  const entry = view.ranking?.find((r) => r.playerId === me.playerId);
  const rank = me.rank ?? entry?.rank ?? null;
  const headline = !finished
    ? 'Tu es éliminé'
    : rank === 1
      ? 'Victoire !'
      : `${rank ? ordinal(rank) : '?'} sur ${view.players.length}`;

  return (
    <PhoneScreen code={view.code} color={me.color} gap={16}>
      <div>
        <h1 className={clsx('state', rank === 1 && 'me')}>{headline}</h1>
        <p className="muted">
          {finished ? 'La partie est terminée.' : 'La partie continue sans toi.'}
        </p>
      </div>
      <MyFleetGrid view={view} me={me} dim />
      {entry && (
        <div className="panel flex flex-col gap-2">
          {STATS.map((stat) => (
            <div key={stat.label} className="kv">
              <span>{stat.label}</span>
              <b>{stat.value(entry)}</b>
            </div>
          ))}
        </div>
      )}
      <a className="btn ghost" href={`/board/${view.code}`} target="_blank" rel="noreferrer">
        Regarder l'écran central
      </a>
    </PhoneScreen>
  );
}
