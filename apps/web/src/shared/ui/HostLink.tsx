import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HostLink } from '@navale/protocol';
import { api, ApiError } from '../api.js';
import { getSession } from '../session.js';
import { copyText } from '../share.js';

const LABEL = 'Changer d’appareil hôte';

/**
 * « Changer d'appareil hôte », pour l'hôte : un QR et un lien qui donnent ses boutons à
 * un autre appareil (la télé, un téléphone). En texte dans le lobby, parmi les boutons de
 * l'hôte (d'où un libellé plus court), en icône pendant la partie. Rien sans jeton d'hôte
 * dans ce navigateur.
 */
export function HostLinkButton({
  code,
  variant = 'text',
  label = LABEL,
}: {
  code: string;
  variant?: 'text' | 'icon';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const hostToken = getSession(code).hostToken;
  if (!hostToken) return null;
  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          className="icon-btn host-link"
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
            <rect x="2" y="4" width="13" height="10" rx="1.5" />
            <path d="M6 19h5M8.5 14v5" />
            <rect x="17" y="8" width="5" height="12" rx="1.2" />
          </svg>
        </button>
      ) : (
        <button type="button" className="btn ghost" title={LABEL} onClick={() => setOpen(true)}>
          {label}
        </button>
      )}
      {open &&
        createPortal(
          <HostLinkSheet code={code} hostToken={hostToken} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}

function HostLinkSheet({
  code,
  hostToken,
  onClose,
}: {
  code: string;
  hostToken: string;
  onClose: () => void;
}) {
  const [link, setLink] = useState<HostLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Le lien est demandé une fois par ouverture : l'écran central se redessine à chaque coup.
  useEffect(() => {
    let live = true;
    api.hostLink(code, { hostToken }).then(
      (l) => live && setLink(l),
      (err: unknown) =>
        live && setError(err instanceof ApiError ? err.message : 'Le serveur ne répond pas.'),
    );
    return () => {
      live = false;
    };
  }, [code, hostToken]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fb-scrim" onClick={onClose}>
      <div
        className="fb-sheet host-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="host-title">{LABEL}</h2>
        <p className="muted">
          Scanne ce QR avec l’appareil qui doit devenir hôte, ou envoie-lui le lien.
        </p>
        <div className="host-qr">
          {link ? (
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(link.qr)}`}
              alt="QR code du lien d’hôte"
            />
          ) : error ? (
            <p className="hint err">{error}</p>
          ) : (
            <span className="muted">Préparation du lien…</span>
          )}
        </div>
        <p className="muted">
          Cet appareil-ci garde la main lui aussi. Ne montre ce QR qu’à qui doit être hôte.
        </p>
        <div className="fb-row">
          <button type="button" className="btn ghost" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!link}
            onClick={() => {
              if (link) void copyText(link.url).then((ok) => setCopy(ok ? 'copied' : 'failed'));
            }}
          >
            {copy === 'copied'
              ? 'Lien copié'
              : copy === 'failed'
                ? 'Copie impossible'
                : 'Copier le lien'}
          </button>
        </div>
      </div>
    </div>
  );
}
