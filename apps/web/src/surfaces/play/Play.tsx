import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { getSession, saveSession, clearPlayer } from '../../shared/session.js';
import { useGameSocket } from '../../shared/socket.js';
import { isPlayerView, useGame } from '../../shared/store.js';
import { Notice } from '../../shared/ui/Notice.js';
import { Splash } from '../../shared/ui/Splash.js';
import { useLaunchSplash } from '../../shared/useLaunchSplash.js';
import { useWakeLock } from '../../shared/useWakeLock.js';
import { Join } from './Join.js';
import { Placement } from './Placement.js';
import { PlayPlaying } from './PlayPlaying.js';
import { Waiting } from './Waiting.js';

const SPLASH_MS = 2200;

/** Téléphone du joueur : rejoindre, placer, attendre, jouer. */
export function Play() {
  const code = (useParams().code ?? '').toUpperCase();
  const [generation, setGeneration] = useState(0);
  const session = useMemo(() => getSession(code), [code, generation]);
  const auth = session.playerToken
    ? ({
        kind: 'player',
        token: session.playerToken,
        ...(session.hostToken ? { hostToken: session.hostToken } : {}),
      } as const)
    : ({ kind: 'join', code } as const);
  const socket = useGameSocket(auth, `${auth.kind}:${code}:${generation}`);
  const { view, conn, error } = useGame();
  // Le téléphone reste allumé pendant la partie : pas de tour manqué.
  const wake = useWakeLock(view?.status === 'PLAYING');
  // Faux chargement au lancement, en même temps que l'écran central.
  const splash = useLaunchSplash(view?.status, SPLASH_MS);

  // Jeton refusé (partie oubliée, joueur exclu entre-temps) : on l'oublie et on revient en simple visiteur.
  const tokenRefused =
    conn === 'rejected' && error?.code === 'TOKEN_INVALID' && !!session.playerToken;
  useEffect(() => {
    if (!tokenRefused) return;
    clearPlayer(code);
    setGeneration((g) => g + 1);
  }, [tokenRefused, code]);
  useEffect(() => {
    if (conn === 'removed') clearPlayer(code);
  }, [conn, code]);

  if (tokenRefused) return <Notice title="Reconnexion…" />;
  if (conn === 'rejected') {
    const text =
      error?.code === 'GAME_NOT_JOINABLE'
        ? 'La partie a déjà commencé. Tu peux la suivre sur l’écran central.'
        : (error?.message ?? 'Connexion refusée.');
    return (
      <Notice
        title={
          error?.code === 'CODE_UNKNOWN' ? 'Aucune partie avec ce code' : 'Impossible de rejoindre'
        }
        text={text}
        action={{ to: '/', label: 'Retour à l’accueil' }}
      />
    );
  }
  if (conn === 'removed') {
    return (
      <Notice
        title="Tu as été retiré de la partie"
        action={{ to: '/', label: 'Retour à l’accueil' }}
      />
    );
  }
  if (!view) return <Notice title="Connexion…" />;

  if (!isPlayerView(view)) {
    return (
      <Join
        view={view}
        socket={socket}
        onJoined={(playerId, playerToken) => {
          saveSession(code, { gameId: view.gameId, playerId, playerToken });
        }}
      />
    );
  }

  const me = view.players.find((p) => p.playerId === view.me.playerId);
  if (!me)
    return (
      <Notice
        title="Tu n’es plus dans cette partie"
        action={{ to: '/', label: 'Retour à l’accueil' }}
      />
    );

  const screen =
    view.status === 'LOBBY' ? (
      me.status === 'PLACING' ? (
        <Placement view={view} me={me} socket={socket} />
      ) : (
        <Waiting view={view} me={me} socket={socket} />
      )
    ) : view.status === 'CANCELLED' ? (
      <Notice title="Partie annulée" action={{ to: '/', label: 'Retour à l’accueil' }} />
    ) : splash ? (
      <Splash duration={SPLASH_MS} phone />
    ) : (
      <PlayPlaying view={view} me={me} socket={socket} />
    );
  return (
    <>
      {conn === 'disconnected' && (
        <div className="reconnecting">Connexion perdue · reconnexion…</div>
      )}
      {screen}
      {view.status === 'PLAYING' &&
        conn !== 'disconnected' &&
        (wake === 'denied' || wake === 'unsupported') && (
          <div className="wake-toast">Pense à garder l’écran allumé</div>
        )}
    </>
  );
}
