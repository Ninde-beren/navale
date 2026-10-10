import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../../shared/api.js';
import { getSession, saveSession } from '../../shared/session.js';
import { Notice } from '../../shared/ui/Notice.js';

/**
 * Arrivée par un lien d'hôte (`/host/ABCD#jeton`) : le serveur vérifie le jeton, ce
 * navigateur le garde, et l'écran central s'ouvre avec les boutons de l'hôte. L'adresse
 * est remplacée : le jeton ne reste pas dans l'historique.
 */
export function HostLanding() {
  const code = (useParams().code ?? '').toUpperCase();
  const navigate = useNavigate();
  const [token] = useState(() => decodeURIComponent(location.hash.slice(1)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const toBoard = () => void navigate(`/board/${code}`, { replace: true });
    if (!token) return setError('Ce lien d’hôte est incomplet : il manque la fin, après le #.');
    // L'appareil qui a montré le lien l'ouvre lui-même : il est déjà l'hôte, rien à noter.
    if (getSession(code).hostToken === token) return toBoard();
    let live = true;
    api.openHostLink(code, { hostToken: token }).then(
      () => {
        if (!live) return;
        saveSession(code, { hostToken: token });
        toBoard();
      },
      (err: unknown) => {
        if (!live) return;
        // Jeton refusé : il quitte l'adresse. Serveur muet : il reste, un rechargement réessaie.
        if (err instanceof ApiError) history.replaceState(history.state, '', location.pathname);
        setError(
          err instanceof ApiError
            ? err.message
            : 'Le serveur ne répond pas. Recharge la page dans un instant.',
        );
      },
    );
    return () => {
      live = false;
    };
  }, [code, token, navigate]);

  if (error)
    return (
      <Notice
        title="Ce lien d’hôte ne marche pas"
        text={error}
        actions={[
          { to: `/board/${code}`, label: 'Ouvrir l’écran central', primary: true },
          { to: '/', label: 'Retour à l’accueil' },
        ]}
      />
    );
  return <Notice title="Prise en main…" />;
}
