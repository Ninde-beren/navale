import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { GameView } from '@navale/protocol';
import { play } from '../../shared/audio.js';
import { STATS, betsLabel, ofName } from '../../shared/labels.js';
import { bestGhosts, playerLookup } from '../../shared/players.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { FeedbackButton } from '../../shared/ui/Feedback.js';
import { SoundButton } from '../../shared/ui/SoundButton.js';

/**
 * Fin de partie : vainqueur, classement, la revanche pour l'hôte (mêmes joueurs, même code) et
 * le replay. À la fin d'un replay, pas de revanche : revoir depuis le début, ou partir.
 */
export function BoardFinished({
  view,
  socket,
  onRestart,
}: {
  view: GameView;
  socket: SocketRef;
  /** Fin d'un replay : le bouton qui le relance depuis le début. */
  onRestart?: () => void;
}) {
  const ranking = view.ranking ?? [];
  const { byId, nameOf } = playerLookup(view.players);
  const winner = ranking.find((r) => r.rank === 1);
  const ghosts = bestGhosts(view.players);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    play('victory');
  }, []);

  const rematch = async () => {
    setBusy(true);
    setError(null);
    const ack = await sendCommand(socket.current, { type: 'REMATCH' });
    if (!ack.ok) {
      setError(ack.error.message);
      setBusy(false);
    }
  };

  return (
    <div className="finish">
      <h1 className={`c-${(winner && byId.get(winner.playerId)?.color) ?? 'blue'} pc`}>
        {winner ? `Victoire ${ofName(nameOf(winner.playerId))}` : 'Égalité'}
      </h1>
      <table>
        <thead>
          <tr>
            <th>Rang</th>
            <th>Joueur</th>
            {STATS.map((stat) => (
              <th key={stat.label}>{stat.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranking.map((entry) => {
            const player = byId.get(entry.playerId);
            return (
              <tr key={entry.playerId} className={`c-${player?.color ?? 'blue'}`}>
                <td>{entry.rank}</td>
                <td>
                  <span className="who">
                    {player && <PlayerAvatar player={player} size="sm" />}
                    <b className="pc">{nameOf(entry.playerId)}</b>
                  </span>
                </td>
                {STATS.map((stat) => (
                  <td key={stat.label}>{stat.value(entry)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {ghosts.length > 0 && (
        <p className="ghost-best">
          Meilleur fantôme :{' '}
          {ghosts.map((p, i) => (
            <span key={p.playerId}>
              {i > 0 && ', '}
              <b className={`c-${p.color} pc`}>{p.name}</b>
            </span>
          ))}
          , {betsLabel(ghosts[0]!.bets)}
        </p>
      )}
      <div className="actions">
        {onRestart ? (
          <button className="btn primary xl" type="button" onClick={onRestart}>
            Revoir depuis le début
          </button>
        ) : view.isHost ? (
          <>
            <button className="btn primary xl" disabled={busy} onClick={() => void rematch()}>
              {busy ? 'Revanche…' : 'Revanche'}
            </button>
            <Link className="btn ghost" to="/create">
              Nouvelle partie
            </Link>
          </>
        ) : (
          <p className="muted">L’hôte peut lancer une revanche : mêmes joueurs, même code.</p>
        )}
        {!onRestart && (
          <Link className="btn ghost" to={`/replay/${view.gameId}`}>
            Revoir la partie
          </Link>
        )}
        <Link className="btn ghost" to="/">
          Quitter
        </Link>
        <span className="flex items-center gap-3">
          <SoundButton />
          <FeedbackButton />
        </span>
      </div>
      {error && <p className="hint err">{error}</p>}
    </div>
  );
}
