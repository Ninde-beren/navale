import { Wordmark } from '../../shared/ui/Wordmark.js';
import { TableScene } from './TableScene.js';

/**
 * Source de l'image d'aperçu de lien (`public/og-image.jpg`, 1200×630). Servie en
 * développement seulement, sur `/og-card`. Pour régénérer l'image, le web tournant
 * en HTTP sur le port 5252 (`WEB_HTTPS=0 WEB_PORT=5252 pnpm --filter @navale/web dev`) :
 *
 *   google-chrome --headless=new --hide-scrollbars --virtual-time-budget=8000 \
 *     --window-size=1200,630 --screenshot=apps/web/public/og-image.jpg \
 *     http://localhost:5252/og-card
 */
export function OgCard() {
  return (
    <div className="og-card">
      <div className="og-card-text">
        <Wordmark />
        <h1>
          Coule tes amis
          <br />
          autour de la table
        </h1>
        <p>
          Tout le monde connaît la bataille navale.
          <br />
          Sauf qu'ici, on peut y jouer à quatre.
        </p>
      </div>
      <TableScene still={1} />
    </div>
  );
}
