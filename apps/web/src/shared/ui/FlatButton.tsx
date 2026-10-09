import clsx from 'clsx';
import { useBoardPrefs } from '../boardPrefs.js';

const LABEL = 'Tablette à plat : chaque grille tournée vers son joueur';

/**
 * Bascule « tablette à plat » de l'écran central : une puce dans le lobby, une
 * icône pendant la partie. Préférence de l'appareil, pas de la partie.
 */
export function FlatButton({ variant = 'icon' }: { variant?: 'icon' | 'chip' }) {
  const flat = useBoardPrefs((s) => s.flat);
  const toggle = useBoardPrefs((s) => s.toggleFlat);
  if (variant === 'chip') {
    return (
      <button
        type="button"
        className={clsx('chip plain toggle', flat && 'on')}
        aria-pressed={flat}
        title={LABEL}
        onClick={toggle}
      >
        {flat ? 'Tablette à plat' : 'Écran face aux joueurs'}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={clsx('icon-btn flat', flat && 'on')}
      aria-label={LABEL}
      aria-pressed={flat}
      title={LABEL}
      onClick={toggle}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M12 8v8M8 12h8" />
        <path d="M9 4.5 12 2l3 2.5M9 19.5 12 22l3-2.5" />
      </svg>
    </button>
  );
}
