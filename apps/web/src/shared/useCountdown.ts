import { useEffect, useState } from 'react';

/** Secondes restantes avant `deadline` (horloge serveur ≈ horloge locale), ou null sans échéance. */
export function useCountdown(deadline: number | null | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);
  return left;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** «  · 1:05 » après un texte quand un chrono tourne, rien sinon. */
export const timerSuffix = (secondsLeft: number | null) =>
  secondsLeft === null ? '' : ` · ${mmss(secondsLeft)}`;
