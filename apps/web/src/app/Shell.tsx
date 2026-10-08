import { Outlet, useLocation } from 'react-router';
import { FeedbackButton } from '../shared/ui/Feedback.js';

/**
 * Enveloppe de toutes les pages. Sur l'accueil et la création, le bouton
 * « Un avis ? » flotte en bas à gauche ; l'écran central et le téléphone le
 * portent dans leur barre, là où il ne gêne ni les grilles ni les actions.
 */
export function Shell() {
  const { pathname } = useLocation();
  const floating = !/^\/(board|play|og-card)(\/|$)/.test(pathname);
  return (
    <>
      <Outlet />
      {floating && <FeedbackButton variant="fab" />}
    </>
  );
}
