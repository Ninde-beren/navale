import clsx from 'clsx';
import { coordKey } from '@navale/engine';
import type { Commander, Coord, LitCell, PublicPlayer, Ship } from '@navale/protocol';
import { publicGridClasses } from '../../shared/cells.js';
import { abilityHint, betsLabel, ordinal } from '../../shared/labels.js';
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
  ghost = false,
  ghostReady = false,
  lights = [],
  fleet,
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
  /** Éliminé d'une partie à fantômes : il pronostique, sa plaque montre ses bons pronostics. */
  ghost?: boolean;
  /** Fantôme dont la carte est prête : sa plaque le dit. */
  ghostReady?: boolean;
  /** Cases éclairées par l'animation d'un fantôme, pas encore dans l'instantané. */
  lights?: LitCell[];
  /** Replay d'une partie finie : sa flotte, cernée sur la grille là où elle n'est pas révélée. */
  fleet?: Ship[] | undefined;
}) {
  const eliminated = player.status === 'ELIMINATED';
  const hull = new Set((fleet ?? []).flatMap((s) => s.cells.map(coordKey)));
  const classes = publicGridClasses(
    [...player.revealed, ...reveals],
    player.sunkShips,
    fresh,
    player.pierced,
    [...player.lit, ...lights],
  );
  return (
    <section
      className={clsx(
        'zone',
        `c-${player.color}`,
        active && 'active',
        eliminated && 'out',
        ghost && 'haunt',
      )}
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
        {ghost && (
          <span
            key={player.bets.won}
            className="role ghost"
            title="Ses pronostics de fantôme : les bons, sur ceux qui ont compté"
          >
            fantôme{player.bets.total > 0 && ` · ${betsLabel(player.bets)}`}
            {ghostReady && ' · carte prête'}
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
        cellClass={(x, y) => clsx(classes(x, y), hull.has(coordKey({ x, y })) && 'hull')}
        className={clsx(eliminated && 'dim')}
        label={`Grille de ${player.name}`}
      >
        {sweep && <RadarSweep grid={grid} center={sweep.center} size={sweep.size} />}
      </Grid>
      {eliminated && <div className="stamp">{player.rank ? ordinal(player.rank) : 'Éliminé'}</div>}
    </section>
  );
}
