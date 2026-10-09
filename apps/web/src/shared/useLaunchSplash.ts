import { useEffect, useRef, useState } from 'react';
import type { GameStatus } from '@navale/protocol';

/**
 * Vrai pendant `ms` quand la partie passe du lobby au jeu sous nos yeux : le faux
 * chargement du lancement. Jamais après un rechargement, qui arrive déjà en jeu.
 */
export function useLaunchSplash(status: GameStatus | undefined, ms: number): boolean {
  const previous = useRef(status);
  const [splash, setSplash] = useState(false);
  useEffect(() => {
    if (previous.current === 'LOBBY' && status === 'PLAYING') {
      setSplash(true);
      const timer = setTimeout(() => setSplash(false), ms);
      return () => clearTimeout(timer);
    }
    previous.current = status;
    return undefined;
  }, [status, ms]);
  useEffect(() => {
    if (!splash) previous.current = status;
  }, [splash, status]);
  return splash;
}
