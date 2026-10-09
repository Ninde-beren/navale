import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useMusic } from '../../shared/audio.js';
import { useBoardPrefs } from '../../shared/boardPrefs.js';
import { getSession } from '../../shared/session.js';
import { useGameSocket } from '../../shared/socket.js';
import { useGame } from '../../shared/store.js';
import { FeedbackButton } from '../../shared/ui/Feedback.js';
import { Notice } from '../../shared/ui/Notice.js';
import { Splash } from '../../shared/ui/Splash.js';
import { useLaunchSplash } from '../../shared/useLaunchSplash.js';
import { PHONE_QUERY, useMedia } from '../../shared/useMedia.js';
import { useWakeLock } from '../../shared/useWakeLock.js';
import { BoardFinished } from './BoardFinished.js';
import { BoardLobby } from './BoardLobby.js';
import { BoardPlaying } from './BoardPlaying.js';

const SPLASH_MS = 2800;

/** Écran central : public, accessible par le code. L'hôte y ajoute son jeton pour ses boutons. */
export function Board() {
  const code = (useParams().code ?? '').toUpperCase();
  const session = useMemo(() => getSession(code), [code]);
  const socket = useGameSocket(
    { kind: 'board', code, ...(session.hostToken ? { hostToken: session.hostToken } : {}) },
    `board:${code}`,
  );
  const { view, conn, error } = useGame();
  // Tablette posée à plat : grilles tournées vers les joueurs, pendant la partie seulement.
  const flat = useBoardPrefs((s) => s.flat);
  // Sur smartphone, on ne crée pas de partie : l'avis ne le propose pas.
  const phone = useMedia(PHONE_QUERY);
  // La table reste allumée du lobby à la fin de partie.
  const wake = useWakeLock(view?.status === 'LOBBY' || view?.status === 'PLAYING');
  // Musique de fond tant que la table est ouverte ; la victoire la coupe.
  useMusic(view?.status === 'LOBBY' || view?.status === 'PLAYING');
  // Faux chargement au lancement : seulement quand on vient du lobby, jamais après un rechargement.
  const splash = useLaunchSplash(view?.status, SPLASH_MS);

  if (conn === 'rejected') {
    return (
      <Notice
        title="Aucune partie avec ce code"
        text={
          error?.code === 'CODE_UNKNOWN' || !error
            ? `La partie est peut-être terminée ou expirée : un code est libéré après la fin. Vérifie-le sur l’écran central${phone ? '.' : ', ou crée une nouvelle partie.'}`
            : error.message
        }
        actions={
          phone
            ? [{ to: '/', label: 'Retour à l’accueil', primary: true }]
            : [
                { to: '/create', label: 'Créer une partie', primary: true },
                { to: '/', label: 'Retour à l’accueil' },
              ]
        }
      />
    );
  }
  if (!view) return <Notice title="Connexion…" />;

  const n = view.players.length;
  const layout: 'p2' | 'p3' | '' =
    view.status === 'PLAYING' || view.status === 'FINISHED'
      ? n <= 2
        ? 'p2'
        : n === 3
          ? 'p3'
          : ''
      : '';

  const screen =
    view.status === 'LOBBY' ? (
      <BoardLobby view={view} socket={socket} />
    ) : view.status === 'PLAYING' ? (
      splash ? (
        <Splash duration={SPLASH_MS} />
      ) : (
        <BoardPlaying key={view.gameId} view={view} socket={socket} layout={layout} flat={flat} />
      )
    ) : view.status === 'FINISHED' ? (
      <BoardFinished key={view.gameId} view={view} socket={socket} />
    ) : (
      <div className="finish">
        <h1>Partie annulée</h1>
        <Link className="btn ghost" to="/">
          Retour à l’accueil
        </Link>
        <FeedbackButton variant="link" />
      </div>
    );

  return (
    <div className="stage">
      <main className={`screen tv v2 ${layout} ${flat && view.status === 'PLAYING' ? 'flat' : ''}`}>
        {screen}
        {conn === 'disconnected' && (
          <div className="chip out" style={{ position: 'absolute', right: 32, bottom: 32 }}>
            Reconnexion…
          </div>
        )}
        {(wake === 'denied' || wake === 'unsupported') && (
          <div className="chip plain wake-hint">Pense à garder l’écran allumé</div>
        )}
      </main>
    </div>
  );
}
