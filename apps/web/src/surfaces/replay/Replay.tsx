import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { pacing } from '@navale/engine';
import type { ReplayFile, Ship } from '@navale/protocol';
import { api, ApiError } from '../../shared/api.js';
import { useBoardPrefs } from '../../shared/boardPrefs.js';
import {
  replayScript,
  roundCount,
  roundStart,
  viewBefore,
  type ReplayScript,
} from '../../shared/replay.js';
import {
  REPLAY_FILE_MAX_BYTES,
  downloadReplayFile,
  readReplayFile,
  replayFile,
} from '../../shared/replayFile.js';
import { useGame } from '../../shared/store.js';
import { Notice } from '../../shared/ui/Notice.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { useWakeLock } from '../../shared/useWakeLock.js';
import { BoardFinished } from '../board/BoardFinished.js';
import { BoardPlaying } from '../board/BoardPlaying.js';
import { boardLayout } from '../board/layout.js';

/** Le replay ne commande rien : pas de connexion, pas de boutons d'hôte. */
const NO_SOCKET = { current: null };
/** La pause entre deux coups, à vitesse normale : le temps de lire l'écran. */
const BETWEEN_STEPS_MS = 700;
const SPEEDS = [1, 2] as const;
type Speed = (typeof SPEEDS)[number];

/** Le temps d'annonce d'un tir à cette vitesse ; l'animation d'un tir ne descend pas sous 1,2 s. */
function announceMs(revealDelayMs: number, speed: Speed): number {
  return Math.max(1200, Math.round(revealDelayMs / speed));
}

/**
 * Le lecteur : il rejoue les pas de la partie dans le magasin de l'écran central, au rythme
 * qu'avait le serveur (`pacing`), comme si la partie se jouait. Un pas commencé va jusqu'au
 * bout ; la pause arrête avant le suivant. Se déplacer remet l'écran juste avant un pas.
 */
function useReplayPlayer(script: ReplayScript | null) {
  const [next, setNext] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<Speed>(1);
  // Change à chaque déplacement : l'écran repart de zéro, sans rejouer les animations passées.
  const [generation, setGeneration] = useState(0);
  const timers = useRef<number[]>([]);
  const nextRef = useRef(0);
  const playingRef = useRef(false);
  const busyRef = useRef(false);
  const speedRef = useRef<Speed>(1);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clear = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    busyRef.current = false;
  };

  const playStep = useCallback(
    (k: number) => {
      if (!script) return;
      const step = script.steps[k];
      if (!step) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      busyRef.current = true;
      const delay = announceMs(script.start.view.settings.revealDelayMs, speedRef.current);
      const { offsets, total } = pacing(
        step.envelopes.map((e) => e.event),
        delay,
      );
      step.envelopes.forEach((envelope, i) =>
        later(() => useGame.getState().pushEvent(envelope), offsets[i]!),
      );
      later(() => {
        useGame.getState().setView(step.view);
        nextRef.current = k + 1;
        setNext(k + 1);
        busyRef.current = false;
        if (playingRef.current) later(() => playStep(k + 1), BETWEEN_STEPS_MS / speedRef.current);
      }, total);
    },
    [script],
  );

  const seek = useCallback(
    (k: number) => {
      if (!script) return;
      clear();
      const target = Math.max(0, Math.min(k, script.steps.length));
      useGame.setState({ view: viewBefore(script, target).view, events: [] });
      nextRef.current = target;
      setNext(target);
      setGeneration((g) => g + 1);
      if (playingRef.current) later(() => playStep(target), BETWEEN_STEPS_MS);
    },
    [script, playStep],
  );

  useEffect(() => {
    if (!script) return;
    useGame.setState({ conn: 'connected', error: null });
    seek(0);
    return clear;
  }, [script, seek]);

  const play = () => {
    if (!script) return;
    if (nextRef.current >= script.steps.length) seek(0);
    playingRef.current = true;
    setPlaying(true);
    if (!busyRef.current) playStep(nextRef.current);
  };
  const pause = () => {
    playingRef.current = false;
    setPlaying(false);
  };
  const setSpeed = (s: Speed) => {
    speedRef.current = s;
    setSpeedState(s);
  };
  return { next, playing, speed, generation, play, pause, seek, setSpeed };
}

/** Revoir une partie terminée, gardée par le serveur 24 h après sa fin. */
export function Replay() {
  const gameId = useParams().gameId ?? '';
  const [loaded, setLoaded] = useState<{ script: ReplayScript; file: ReplayFile } | null>(null);
  const [error, setError] = useState<{ expired: boolean; message: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError(null);
    api
      .replay(gameId)
      .then((replay) => {
        if (alive) setLoaded({ script: replayScript(replay.events), file: replayFile(replay) });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError)
          setError({ expired: e.code === 'REPLAY_EXPIRED', message: e.message });
        else setError({ expired: false, message: 'Le serveur ne répond pas.' });
      });
    return () => {
      alive = false;
    };
  }, [gameId]);

  if (error?.expired) return <ReplayOpen reason={error.message} />;
  if (error)
    return (
      <Notice
        title="Pas de replay"
        text={error.message}
        action={{ to: '/', label: 'Retour à l’accueil' }}
      />
    );
  if (!loaded) return <Notice title="Chargement du replay…" />;
  return <ReplayScreen script={loaded.script} file={loaded.file} />;
}

/**
 * Revoir une partie exportée : le fichier reste dans le navigateur, rien ne part au serveur.
 * Aussi la suite d'un replay expiré, quand quelqu'un a gardé la partie.
 */
export function ReplayOpen({ reason }: { reason?: string }) {
  const [loaded, setLoaded] = useState<{ script: ReplayScript; file: ReplayFile } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (loaded) return <ReplayScreen script={loaded.script} file={loaded.file} />;

  const open = async (picked: File | undefined) => {
    setError(null);
    if (!picked) return;
    if (picked.size > REPLAY_FILE_MAX_BYTES)
      return setError('Ce fichier est bien trop gros pour une partie Navale.');
    const read = readReplayFile(await picked.text());
    if (read.ok) setLoaded({ script: read.script, file: read.file });
    else setError(read.error);
  };

  return (
    <div className="notice app-phone">
      <div className="box">
        <Wordmark />
        <h1 className="h1">{reason ? 'Ce replay a expiré' : 'Revoir une partie exportée'}</h1>
        <p className="muted">
          {reason ??
            'Ouvre le fichier d’une partie exportée depuis son replay : elle se rejoue ici, sur cet écran, sans passer par le serveur.'}
        </p>
        <div className="actions">
          <label className="btn primary">
            Ouvrir un fichier de partie
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => void open(e.target.files?.[0])}
            />
          </label>
          <Link className="btn ghost" to="/">
            Retour à l’accueil
          </Link>
        </div>
        {error && <p className="hint err">{error}</p>}
      </div>
    </div>
  );
}

/** Le lecteur, sur l'écran central : la partie rejouée et sa barre de lecture. */
function ReplayScreen({ script, file }: { script: ReplayScript; file: ReplayFile }) {
  const [showFleets, setShowFleets] = useState(false);
  const player = useReplayPlayer(script);
  const view = useGame((s) => s.view);
  const flat = useBoardPrefs((s) => s.flat);
  useWakeLock(player.playing);
  if (!view || view.gameId !== script.start.view.gameId)
    return <Notice title="Chargement du replay…" />;

  const ended = view.status === 'FINISHED';
  const layout = boardLayout(view);
  const revealDelayMs = announceMs(script.start.view.settings.revealDelayMs, player.speed);
  const shown = { ...view, settings: { ...view.settings, revealDelayMs } };
  const fleets: Record<string, Ship[]> | undefined = showFleets
    ? Object.fromEntries(script.start.state.players.map((p) => [p.playerId, p.fleet]))
    : undefined;
  const round = (view.round?.index ?? 0) + 1;
  const rounds = roundCount(script);

  return (
    <div className="stage">
      <main className={clsx('screen tv v2 replay', layout, flat && !ended && 'flat')}>
        {ended ? (
          <BoardFinished
            key={`${view.gameId}:${player.generation}`}
            view={view}
            socket={NO_SOCKET}
            onRestart={() => {
              player.seek(0);
              player.play();
            }}
            onExport={() => downloadReplayFile(file)}
          />
        ) : (
          <BoardPlaying
            key={`${view.gameId}:${player.generation}`}
            view={shown}
            socket={NO_SOCKET}
            layout={layout}
            flat={flat}
            {...(fleets ? { fleets } : {})}
          />
        )}
        {!ended && (
          <div className="replay-bar" role="toolbar" aria-label="Lecture du replay">
            <span className="tag">Replay</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Manche précédente"
              title="Manche précédente"
              onClick={() => player.seek(roundStart(script, round - 2))}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 5v14M19 5 9 12l10 7z" />
              </svg>
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={player.playing ? player.pause : player.play}
            >
              {player.playing ? 'Pause' : player.next === 0 ? 'Lancer' : 'Reprendre'}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Manche suivante"
              title="Manche suivante"
              onClick={() => player.seek(roundStart(script, round))}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 5v14M5 5l10 7-10 7z" />
              </svg>
            </button>
            <span className="where">
              Manche {round} / {rounds}
            </span>
            <div className="seg" role="radiogroup" aria-label="Vitesse">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={player.speed === s}
                  className={player.speed === s ? 'on' : ''}
                  onClick={() => player.setSpeed(s)}
                >
                  ×{s}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={clsx('btn ghost', showFleets && 'on')}
              aria-pressed={showFleets}
              onClick={() => setShowFleets((v) => !v)}
            >
              {showFleets ? 'Cacher les flottes' : 'Montrer les flottes'}
            </button>
            <button
              type="button"
              className="btn ghost"
              title="Garde la partie dans un fichier : le serveur l’oublie 24 h après sa fin"
              onClick={() => downloadReplayFile(file)}
            >
              Exporter
            </button>
            <Link className="btn ghost" to="/">
              Quitter
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
