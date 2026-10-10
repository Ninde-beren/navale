import { radarZone } from '@navale/engine';
import type { PlayerView, PublicPlayer } from '@navale/protocol';
import { ownGridClasses } from '../../shared/cells.js';
import { Grid } from '../../shared/ui/Grid.js';

/** Ma grille, centrée : mes bateaux, les tirs que j'ai reçus, mes leurres et mon bouclier. */
export function MyFleetGrid({
  view,
  me,
  dim = false,
}: {
  view: PlayerView;
  me: PublicPlayer;
  dim?: boolean;
}) {
  return (
    <div className="flex justify-center">
      <Grid
        width={view.settings.grid.width}
        height={view.settings.grid.height}
        cellClass={ownGridClasses(view.me.fleet, me.revealed, {
          decoys: view.me.decoys,
          shielded: me.shield ? radarZone(view.settings, me.shield.center, me.shield.size) : [],
        })}
        className={dim ? 'dim' : ''}
        label="Ma flotte"
      />
    </div>
  );
}
