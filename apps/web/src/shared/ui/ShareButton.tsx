import { useEffect, useState } from 'react';
import { canShare, shareGame } from '../share.js';

/**
 * Partage de la partie : la feuille de partage de l'appareil quand il en a une
 * (le libellé est alors celui donné), sinon la copie du lien de l'écran central,
 * confirmée deux secondes sur le bouton.
 */
export function ShareButton({
  code,
  label = 'Partager la partie',
  className = 'btn ghost',
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [state]);
  const text =
    state === 'copied'
      ? 'Lien copié'
      : state === 'failed'
        ? 'Copie impossible, recopie le lien'
        : canShare()
          ? label
          : 'Copier le lien';
  return (
    <button
      className={className}
      type="button"
      aria-live="polite"
      onClick={() => {
        void shareGame(code).then((outcome) => {
          if (outcome === 'copied' || outcome === 'failed') setState(outcome);
        });
      }}
    >
      {text}
    </button>
  );
}
