import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { canShare, shareGame } from '../share.js';

type State = 'idle' | 'copied' | 'failed';

/**
 * Partage de la partie : la feuille de partage de l'appareil quand il en a une
 * (le libellé est alors celui donné), sinon la copie du lien de l'écran central,
 * confirmée deux secondes. En texte (téléphone) ou en icône (écran central).
 */
export function ShareButton({
  code,
  label = 'Partager la partie',
  className = 'btn ghost',
  variant = 'text',
}: {
  code: string;
  label?: string;
  className?: string;
  variant?: 'text' | 'icon';
}) {
  const [state, setState] = useState<State>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [state]);
  const native = canShare();
  const text =
    state === 'copied'
      ? 'Lien copié'
      : state === 'failed'
        ? 'Copie impossible, recopie le lien'
        : native
          ? label
          : 'Copier le lien';
  const onClick = () => {
    void shareGame(code).then((outcome) => {
      if (outcome === 'copied' || outcome === 'failed') setState(outcome);
    });
  };

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          className={clsx('icon-btn share', state !== 'idle' && state)}
          aria-label={text}
          title={text}
          onClick={onClick}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {state === 'copied' ? (
              <path d="m5 12.5 4.5 4.5L19 7" />
            ) : state === 'failed' ? (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </>
            ) : native ? (
              <>
                <path d="M12 3v12M8 7l4-4 4 4" />
                <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
              </>
            ) : (
              <>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </>
            )}
          </svg>
        </button>
        {state === 'failed' && (
          <span className="note" role="status">
            {text}
          </span>
        )}
      </>
    );
  }

  return (
    <button className={className} type="button" aria-live="polite" onClick={onClick}>
      {text}
    </button>
  );
}
