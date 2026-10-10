import clsx from 'clsx';
import type { Commander, Coord, PublicPlayer } from '@navale/protocol';
import { publicGridClasses } from '../../shared/cells.js';
import { abilityHint, ordinal } from '../../shared/labels.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { RadarSweep } from '../../shared/ui/RadarSweep.js';
import type { Sweep } from './shotFx.js';
import type { Reveal } from './useShotSequence.js';

/** La zone d'un joueur sur l'écran central : sa plaque et sa grille publique. */
export function PlayerZone({
  player,
  seat,
  active,
  grid,
  reveals,
  fresh,
  sweep,
  commander,
}: {
  player: PublicPlayer;
  seat: number;
  /** Son commandant, si la partie en propose ; le point dit s'il lui reste sa capacité. */
  commander?: Commander | undefined;
  /** C'est à lui de tirer (ou, en salve, il n'a pas encore tiré). */
  active: boolean;
  grid: { width: number; height: number };
  /** Cases révélées par l'animation, pas encore dans l'instantané. */
  reveals: Reveal[];
  /** La case qui vient d'être touchée, mise en valeur. */
  fresh: Coord | null;
  /** Un radar qui balaie sa grille : la zone seule, sans écho, qu'il y ait des navires ou non. */
  sweep: Sweep | null;
}) {
  const eliminated = player.status === 'ELIMINATED';
  return (
    <section
      className={clsx('zone', `c-${player.color}`, active && 'active', eliminated && 'out')}
      data-seat={seat}
      data-player={player.playerId}
    >
      <div className="nameplate">
        <PlayerAvatar player={player} />
        <h2>{player.name}</h2>
        {commander && (
          <span className="role cmd" title={abilityHint(commander.ability)}>
            {commander.name} {player.abilityUsesLeft > 0 ? '●' : '○'}
          </span>
        )}
        {player.substitute ? (
          <span className="role">bot en relais</span>
        ) : (
          !player.connected && player.kind === 'human' && <span className="role">hors ligne</span>
        )}
      </div>
      <Grid
        width={grid.width}
        height={grid.height}
        cellClass={publicGridClasses(
          [...player.revealed, ...reveals],
          player.sunkShips,
          fresh,
          player.pierced,
        )}
        className={clsx(eliminated && 'dim')}
        label={`Grille de ${player.name}`}
      >
        {sweep && <RadarSweep grid={grid} center={sweep.center} size={sweep.size} />}
      </Grid>
      {eliminated && <div className="stamp">{player.rank ? ordinal(player.rank) : 'Éliminé'}</div>}
    </section>
  );
}
