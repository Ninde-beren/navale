import clsx from 'clsx';
import { useNavigate } from 'react-router';
import type { PlayerView, PublicPlayer } from '@navale/protocol';
import { STATS, betsLabel, ordinal } from '../../shared/labels.js';
import { bestGhosts } from '../../shared/players.js';
import { useRecord } from '../../shared/profile.js';
import { recordLabel } from '../../shared/record.js';
import { clearPlayer } from '../../shared/session.js';
import type { SocketRef } from '../../shared/socket.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { GhostBets } from './GhostBets.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/**
 * Fin de partie, ou élimination quand la partie continue sans moi : mon rang et mes
 * chiffres ; dans une partie à fantômes, mes pronostics tant qu'elle continue.
 */
export function PlayFinished({
  view,
  me,
  socket,
}: {
  view: PlayerView;
  me: PublicPlayer;
  socket: SocketRef;
}) {
  const navigate = useNavigate();
  const record = recordLabel(useRecord());
  const finished = view.status === 'FINISHED';
  const ghost = !finished && view.settings.eliminated === 'ghosts';
  const entry = view.ranking?.find((r) => r.playerId === me.playerId);
  const rank = me.rank ?? entry?.rank ?? null;
  const best = finished ? bestGhosts(view.players) : [];
  const headline = ghost
    ? 'Tu es fantôme'
    : !finished
      ? 'Tu es éliminé'
      : rank === 1
        ? 'Victoire !'
        : `${rank ? ordinal(rank) : '?'} sur ${view.players.length}`;

  return (
    <PhoneScreen code={view.code} color={me.color} gap={16}>
      <div>
        <h1 className={clsx('state', rank === 1 && 'me')}>{headline}</h1>
        <p className="muted">
          {ghost
            ? 'Éliminé, mais pas sorti du jeu : pronostique chaque manche.'
            : finished
              ? 'La partie est terminée.'
              : 'La partie continue sans toi.'}
        </p>
      </div>
      {ghost && <GhostBets view={view} me={me} socket={socket} />}
      <MyFleetGrid view={view} me={me} dim />
      {entry && (
        <div className="panel flex flex-col gap-2">
          {STATS.map((stat) => (
            <div key={stat.label} className="kv">
              <span>{stat.label}</span>
              <b>{stat.value(entry)}</b>
            </div>
          ))}
          {me.bets.total > 0 && (
            <div className="kv">
              <span>Pronostics</span>
              <b>{betsLabel(me.bets)}</b>
            </div>
          )}
        </div>
      )}
      {best.length > 0 && (
        <p className="muted">
          Meilleur fantôme :{' '}
          {best.map((p) => (p.playerId === me.playerId ? 'toi' : p.name)).join(', ')} (
          {betsLabel(best[0]!.bets)}).
        </p>
      )}
      {record && <p className="muted">Ton bilan sur ce téléphone : {record}.</p>}
      <a className="btn ghost" href={`/board/${view.code}`} target="_blank" rel="noreferrer">
        Regarder l'écran central
      </a>
      <button
        className="btn sm ghost"
        type="button"
        onClick={() => {
          // Partie finie : rien à libérer, on oublie le jeton et on rentre. Éliminé en cours de
          // partie : on reste au classement côté serveur, mais ce téléphone ne reviendra plus.
          if (!finished && !confirm('Quitter la partie ? Tu ne pourras plus y revenir.')) return;
          clearPlayer(view.code);
          void navigate('/');
        }}
      >
        Quitter
      </button>
    </PhoneScreen>
  );
}
