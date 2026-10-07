import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type { View } from '../../shared/store.js';

export function BoardFinished({ view }: { view: View; socket: RefObject<Socket | null> }) {
  const ranking = view.ranking ?? [];
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? '?';
  const winner = ranking.find((r) => r.rank === 1);
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
            <tr key={r.playerId}>
              <td>{r.rank}</td>
              <td>{name(r.playerId)}</td>
              <td>{r.shotsFired}</td>
              <td>{r.hits}</td>
              <td>{Math.round(r.accuracy * 100)} %</td>
              <td>{r.shipsSunk}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">La revanche arrive au jalon M5.</p>
    </div>
  );
}
