import type { CSSProperties } from 'react';
import { coordKey } from '@navale/engine';
import type { Coord } from '@navale/protocol';
import { RADAR_SWEEP } from '../audio.js';
import { RADAR_SWEEP_MS, beamDelay, sweepZone } from '../radarSweep.js';

/** Une case de la zone telle que le radar l'a vue : un navire, ou de l'eau. */
export interface Echo {
  coord: Coord;
  ship: boolean;
}

/** Des propriétés CSS personnalisées (`--x`…), que le type de `style` ne connaît pas. */
const vars = (values: Record<`--${string}`, string | number>) => values as CSSProperties;

/**
 * Le balayage d'un radar, posé sur une grille (enfant de `Grid`) : le carré de la zone,
 * le disque qui la couvre et son rayon qui tourne. Sur l'écran central, rien d'autre :
 * le même dessin et la même durée, qu'il y ait des navires ou non. Sur le téléphone de
 * son auteur seulement, `echoes` : chaque case de la zone s'allume au passage du rayon,
 * rond vert pour un navire, pointillés pour l'eau, comme la grille les garde ensuite.
 */
export function RadarSweep({
  grid,
  center,
  size,
  echoes,
}: {
  grid: { width: number; height: number };
  center: Coord;
  size: number;
  echoes?: Echo[];
}) {
  const { box } = sweepZone(grid, center, size);
  return (
    <span
      className="sweep"
      aria-hidden="true"
      style={vars({
        '--x': center.x,
        '--y': center.y,
        '--size': size,
        '--turn': `${RADAR_SWEEP.turnSeconds}s`,
        '--turns': RADAR_SWEEP.turns,
        '--life': `${RADAR_SWEEP_MS}ms`,
      })}
    >
      {/* Dans cet ordre : les échos dessous, le rayon passe dessus, le carré reste net. */}
      {echoes?.map(({ coord, ship }) => (
        <span
          key={coordKey(coord)}
          className={`sweep-echo ${ship ? 'ship' : 'water'}`}
          style={vars({
            '--ex': coord.x,
            '--ey': coord.y,
            '--at': `${beamDelay(center, coord).toFixed(3)}s`,
          })}
        />
      ))}
      <span className="sweep-disc">
        <i />
      </span>
      <span
        className="sweep-zone"
        style={vars({ '--zx': box.x, '--zy': box.y, '--zw': box.width, '--zh': box.height })}
      />
    </span>
  );
}
