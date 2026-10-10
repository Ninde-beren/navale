import type { PlayerView, PublicPlayer } from '@navale/protocol';
import { ownGridClasses, shieldMarks } from '../../shared/cells.js';
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
          shield: shieldMarks(view.settings, me.shield, me.revealed),
        })}
        className={dim ? 'dim' : ''}
        label="Ma flotte"
      />
    </div>
  );
}
