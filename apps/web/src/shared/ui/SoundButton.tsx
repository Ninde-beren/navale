import { useRef } from 'react';
import { unlock, useSfx } from '../audio.js';

/**
 * Muet / son. Après un chargement, le navigateur bloque l'audio jusqu'au premier
 * geste sur la page : le bouton le dit en clair, et un clic dessus déverrouille
 * sans couper le son (le geste global a déjà lancé la reprise, on ne bascule pas).
 */
export function SoundButton({ className = '' }: { className?: string }) {
  const { muted, unlocked, toggle } = useSfx();
  const locked = !muted && !unlocked;
  const wasLocked = useRef(false);
  const label = muted
    ? 'Activer le son'
    : locked
      ? 'Son bloqué par le navigateur'
      : 'Couper le son';
  return (
    <>
      <button
        type="button"
        className={`icon-btn sound ${muted ? 'off' : ''} ${locked ? 'locked' : ''} ${className}`}
        aria-label={label}
        aria-pressed={!muted}
        title={label}
        onPointerDown={() => {
          wasLocked.current = locked;
        }}
        onClick={() => {
          if (wasLocked.current) {
            wasLocked.current = false;
            void unlock();
            return;
          }
          toggle();
        }}
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
      {locked && <span className="sound-hint">Son : touche l’écran</span>}
    </>
  );
}
