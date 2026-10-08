import { useEffect, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Socket } from 'socket.io-client';
import { play } from '../../shared/audio.js';
import { sendCommand } from '../../shared/socket.js';
import type { View } from '../../shared/store.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { SoundButton } from '../../shared/ui/SoundButton.js';

/** Fin de partie : vainqueur, classement, et la revanche pour l'hôte (mêmes joueurs, même code). */
export function BoardFinished({ view, socket }: { view: View; socket: RefObject<Socket | null> }) {
  const ranking = view.ranking ?? [];
  const playerOf = (id: string) => view.players.find((p) => p.playerId === id);
  const name = (id: string) => playerOf(id)?.name ?? '?';
  const winner = ranking.find((r) => r.rank === 1);
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
      <h1
        className={`c-${(winner && view.players.find((p) => p.playerId === winner.playerId)?.color) ?? 'blue'} pc`}
      >
        {winner ? `Victoire de ${name(winner.playerId)}` : 'Égalité'}
      </h1>
      <table>
        <thead>
          <tr>
            <th>Rang</th>
            <th>Joueur</th>
            <th>Tirs</th>
            <th>Touches</th>
            <th>Précision</th>
            <th>Coulés</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => (
            <tr key={r.playerId} className={`c-${playerOf(r.playerId)?.color ?? 'blue'}`}>
              <td>{r.rank}</td>
              <td>
                <span className="who">
                  <Avatar
                    color={playerOf(r.playerId)?.color ?? 'blue'}
                    initial={initialOf(name(r.playerId))}
                    size="sm"
                    bot={playerOf(r.playerId)?.kind === 'bot'}
                  />
                  <b className="pc">{name(r.playerId)}</b>
                </span>
              </td>
              <td>{r.shotsFired}</td>
              <td>{r.hits}</td>
              <td>{Math.round(r.accuracy * 100)} %</td>
              <td>{r.shipsSunk}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        {view.isHost ? (
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
        <SoundButton />
      </div>
      {error && <p className="hint err">{error}</p>}
    </div>
  );
}
