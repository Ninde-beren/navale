import { useEffect, useRef, useState } from 'react';
import type { Coord, PlayerView, PublicPlayer } from '@navale/protocol';
import { play, playSunkJingle } from '../../shared/audio.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { useRoundResolving } from '../../shared/store.js';
import { PlayAim } from './PlayAim.js';
import { PlayFinished } from './PlayFinished.js';
import { PlaySealed } from './PlaySealed.js';
import { PlayWatching } from './PlayWatching.js';

/** Vibration et deux notes quand mon tour arrive. */
function useTurnAlert(myTurn: boolean): void {
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      navigator.vibrate?.([120, 60, 120]);
      play('turn');
    }
    wasMyTurn.current = myTurn;
  }, [myTurn]);
}

/** Mon petit air de victoire quand un de mes tirs coule un navire. */
function useSunkJingle(view: PlayerView, me: PublicPlayer): void {
  const sunk = view.me.shotsFired.filter((s) => s.result === 'SUNK').length;
  const previous = useRef(sunk);
  useEffect(() => {
    if (sunk > previous.current) playSunkJingle(me.color);
    previous.current = sunk;
  }, [sunk]);
}

/**
 * Téléphone pendant la partie : choisit l'écran (fin, visée, tir engagé en salve,
 * attente) et garde ce qui les relie, le tir parti avant que l'instantané le confirme.
 */
export function PlayPlaying({
  view,
  me,
  socket,
}: {
  view: PlayerView;
  me: PublicPlayer;
  socket: SocketRef;
}) {
  const roundIndex = view.round?.index ?? -1;
  // Manche du tir envoyé : l'instantané qui le confirme n'est peut-être pas encore arrivé.
  const [sentInRound, setSentInRound] = useState<number | null>(null);
  const resolving = useRoundResolving(roundIndex);
  useTurnAlert(view.me.canFire);
  useSunkJingle(view, me);

  if (view.status === 'FINISHED' || me.status === 'ELIMINATED')
    return <PlayFinished view={view} me={me} />;

  const sent = sentInRound === roundIndex;
  if (view.me.canFire && !sent && view.me.legalTargets.length > 0) {
    const fire = async (targetId: string, coord: Coord) => {
      const ack = await sendCommand(socket.current, { type: 'FIRE', targetId, coord });
      if (ack.ok) setSentInRound(roundIndex);
      return ack;
    };
    return <PlayAim key={roundIndex} view={view} me={me} onFire={fire} />;
  }

  const shotSent = view.me.pendingShot !== null || sent;
  if (view.settings.variant === 'simultaneous' && shotSent && !resolving)
    return <PlaySealed view={view} me={me} />;
  return <PlayWatching view={view} me={me} shotSent={shotSent} resolving={resolving} />;
}
