import { useSfx } from '../audio.js';

/** Muet / son, avec l'état de déverrouillage : tant qu'aucun geste n'a eu lieu, le son reste bloqué par le navigateur. */
export function SoundButton({ className = '' }: { className?: string }) {
  const { muted, unlocked, toggle } = useSfx();
  const label = muted ? 'Activer le son' : 'Couper le son';
  return (
    <button
      type="button"
      className={`icon-btn sound ${muted ? 'off' : ''} ${!muted && !unlocked ? 'locked' : ''} ${className}`}
      aria-label={label}
      aria-pressed={!muted}
      title={!muted && !unlocked ? 'Touche l’écran pour activer le son' : label}
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
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted ? (
          <path d="M16 9l5 6M21 9l-5 6" />
        ) : (
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />
        )}
      </svg>
    </button>
  );
}
