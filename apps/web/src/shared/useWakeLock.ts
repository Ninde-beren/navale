import { useEffect, useState } from 'react';

export type WakeLockState = 'idle' | 'on' | 'unsupported' | 'denied';

/**
 * Garde l'écran allumé tant que `active` (E6-S10, E7-S3). Le verrou tombe
 * quand l'onglet passe en arrière-plan : il est redemandé au retour.
 * Sans API ou en cas de refus, l'appelant affiche un message discret.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>('idle');
  useEffect(() => {
    if (!active) {
      setState('idle');
      return;
    }
    if (!('wakeLock' in navigator)) {
      setState('unsupported');
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setState('on');
        s.addEventListener('release', () => {
          if (!cancelled) setState('idle');
        });
      } catch {
        if (!cancelled) setState('denied');
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active]);
  return state;
}
