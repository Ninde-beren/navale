import { useMemo } from 'react';
import { useParams } from 'react-router';
import { getSession } from '../../shared/session.js';
import { useGameSocket } from '../../shared/socket.js';
import { useGame } from '../../shared/store.js';
import { Notice } from '../../shared/ui/Notice.js';
import { BoardFinished } from './BoardFinished.js';
import { BoardLobby } from './BoardLobby.js';
import { BoardPlaying } from './BoardPlaying.js';

/** Écran central : public, accessible par le code. L'hôte y ajoute son jeton pour ses boutons. */
export function Board() {
  const code = (useParams().code ?? '').toUpperCase();
  const session = useMemo(() => getSession(code), [code]);
  const socket = useGameSocket(
    { kind: 'board', code, ...(session.hostToken ? { hostToken: session.hostToken } : {}) },
    `board:${code}`,
  );
  const { view, conn, error } = useGame();

  if (conn === 'rejected') {
    return (
      <Notice
        title="Aucune partie avec ce code"
        text={error?.message}
        action={{ to: '/', label: 'Retour à l’accueil' }}
      />
    );
  }
  if (!view) return <Notice title="Connexion…" />;

  const screen =
    view.status === 'LOBBY' ? (
      <BoardLobby view={view} socket={socket} />
    ) : view.status === 'PLAYING' ? (
      <BoardPlaying view={view} socket={socket} />
    ) : view.status === 'FINISHED' ? (
      <BoardFinished view={view} socket={socket} />
    ) : (
      <div className="finish">
        <h1>Partie annulée</h1>
      </div>
    );

  const n = view.players.length;
  const layout =
    view.status === 'PLAYING' || view.status === 'FINISHED'
      ? n <= 2
        ? 'p2'
        : n === 3
          ? 'p3'
          : ''
      : '';
  return (
    <div className="stage">
      <main className={`screen tv v2 ${layout}`}>
        {screen}
        {conn === 'disconnected' && (
          <div className="chip out" style={{ position: 'absolute', right: 32, bottom: 32 }}>
            Reconnexion…
          </div>
        )}
      </main>
    </div>
  );
}
