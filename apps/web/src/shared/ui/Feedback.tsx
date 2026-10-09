import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { FEEDBACK_MESSAGE_LENGTH, GAME_CODE_PATTERN } from '@navale/protocol';
import { api, ApiError } from '../api.js';

export type FeedbackVariant = 'icon' | 'fab' | 'link';
type Phase = 'idle' | 'sending' | 'sent' | 'error';

const LABEL = 'Un avis, un souci ?';

/**
 * Bouton « Un avis ? », disponible sur toutes les pages : une icône dans une
 * barre (`icon`), un bouton flottant en bas à gauche (`fab`) ou un lien en
 * texte (`link`). Il ouvre une feuille avec un message libre et un e-mail
 * facultatif ; la page et le code de la partie partent avec.
 */
export function FeedbackButton({
  variant = 'icon',
  className = '',
}: {
  variant?: FeedbackVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'link' ? (
        <button type="button" className={`fb-link ${className}`} onClick={() => setOpen(true)}>
          {LABEL}
        </button>
      ) : (
        <button
          type="button"
          className={clsx('icon-btn fb', variant === 'fab' && 'fb-fab', className)}
          aria-label={LABEL}
          title={LABEL}
          onClick={() => setOpen(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
            <path d="M8.5 9h7M8.5 12.5h4" />
          </svg>
        </button>
      )}
      {open && createPortal(<FeedbackSheet onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** Code de la partie d'après l'adresse, s'il y en a un. */
function codeFromPath(path: string): string | undefined {
  return new RegExp(`^/(?:board|play)/(${GAME_CODE_PATTERN})`, 'i').exec(path)?.[1]?.toUpperCase();
}

function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const path = window.location.pathname;
  const code = codeFromPath(path);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ready = message.trim().length >= FEEDBACK_MESSAGE_LENGTH.min;

  useEffect(() => {
    textRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || phase === 'sending') return;
    setPhase('sending');
    setError(null);
    try {
      await api.sendFeedback({
        message: message.trim(),
        email: email.trim(),
        context: {
          path,
          ...(code ? { code } : {}),
          screen: `${window.innerWidth}×${window.innerHeight}`,
        },
      });
      setPhase('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Le serveur ne répond pas.');
      setPhase('error');
    }
  };

  return (
    <div className="fb-scrim" onClick={onClose}>
      <div
        className="fb-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-title"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'sent' ? (
          <>
            <h2 id="fb-title">Merci !</h2>
            <p className="muted">
              C’est transmis.{' '}
              {email.trim() ? 'Tu auras une réponse à cette adresse.' : 'Bonne partie !'}
            </p>
            <div className="fb-row">
              <button type="button" className="btn primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <h2 id="fb-title">{LABEL}</h2>
            <p className="muted">
              Un bug, une idée, un mot : tout aide.{' '}
              {code ? `La page et la partie ${code} sont jointes.` : 'La page est jointe.'}
            </p>
            <textarea
              ref={textRef}
              className="input fb-text"
              required
              minLength={3}
              maxLength={FEEDBACK_MESSAGE_LENGTH.max}
              rows={4}
              placeholder="Ton message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={phase === 'sending'}
            />
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="Ton e-mail, pour une réponse (facultatif)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={phase === 'sending'}
            />
            {phase === 'error' && <p className="hint err">{error}</p>}
            <div className="fb-row">
              <button
                type="button"
                className="btn ghost"
                onClick={onClose}
                disabled={phase === 'sending'}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={!ready || phase === 'sending'}
              >
                {phase === 'sending' ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
