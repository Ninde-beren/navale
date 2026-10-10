import clsx from 'clsx';
import { coordKey, radarZone, sameCoord } from '@navale/engine';
import type { Coord, PlayerView, PublicPlayer, RadarResult } from '@navale/protocol';
import { publicGridClasses } from '../../shared/cells.js';
import { Grid } from '../../shared/ui/Grid.js';
import { RadarSweep } from '../../shared/ui/RadarSweep.js';
import { sameRadar } from './useRadarSweep.js';

/**
 * La grille d'un adversaire sur mon téléphone : ce qui est révélé, mes tirs, son bouclier,
 * ce que mes radars ont vu (navire détecté, ou eau) et la case choisie. Un sonar, ou un
 * radar d'avant les contacts, ne donne qu'un total : sa zone reste en pointillés, sans
 * détail. Le radar qui vient d'arriver (`sweeping`) balaie d'abord : ses cases s'allument
 * au passage du rayon, puis la grille les garde. Sans `onCell`, elle se regarde seulement.
 */
export function TargetGrid({
  view,
  target,
  radars,
  sweeping = null,
  cell = null,
  allowRevealed = false,
  onCell,
  className,
}: {
  view: PlayerView;
  target: PublicPlayer;
  /** Mes radars et sonars sur cette cible. */
  radars: RadarResult[];
  /** Mon radar en train de balayer, s'il y en a un (`useRadarSweep`). */
  sweeping?: RadarResult | null;
  cell?: Coord | null;
  /** Radar et sonar peuvent se centrer sur une case déjà révélée ; un tir, non. */
  allowRevealed?: boolean;
  onCell?: (cell: Coord) => void;
  className?: string;
}) {
  const revealed = new Set(target.revealed.map((r) => coordKey(r.coord)));
  const mine = new Set(
    view.me.shotsFired.filter((s) => s.targetId === target.playerId).map((s) => coordKey(s.coord)),
  );
  const live = radars.find((r) => r.contacts && sweeping && sameRadar(r, sweeping));
  const scanned = new Set<string>();
  const contacts = new Set<string>();
  const unknown = new Set<string>();
  for (const r of radars) {
    if (r === live) continue; // ses cases attendent le passage du rayon
    for (const c of radarZone(view.settings, r.center, r.size))
      (r.contacts ? scanned : unknown).add(coordKey(c));
    for (const c of r.contacts ?? []) contacts.add(coordKey(c));
  }
  const radarClass = (key: string) =>
    revealed.has(key)
      ? null
      : contacts.has(key)
        ? 'blip'
        : scanned.has(key)
          ? 'scan clear'
          : unknown.has(key) && 'scan';
  const classes = publicGridClasses(target.revealed, target.sunkShips, null, target.pierced);
  const ships = new Set((live?.contacts ?? []).map(coordKey));
  const echoes =
    live &&
    radarZone(view.settings, live.center, live.size)
      .filter((c) => !revealed.has(coordKey(c)))
      .map((coord) => ({ coord, ship: ships.has(coordKey(coord)) }));
  return (
    <div className={`flex justify-center c-${target.color}`}>
      <Grid
        width={view.settings.grid.width}
        height={view.settings.grid.height}
        label={`Grille de ${target.name}`}
        className={className}
        cellClass={(x, y) =>
          clsx(
            classes(x, y),
            mine.has(coordKey({ x, y })) && 'mine',
            radarClass(coordKey({ x, y })),
            cell && sameCoord(cell, { x, y }) && 'sel',
          )
        }
        onPointerUp={
          onCell &&
          ((c) => {
            if (!c) return;
            if (!allowRevealed && revealed.has(coordKey(c))) return;
            onCell(c);
          })
        }
      >
        {live && echoes && (
          <RadarSweep
            grid={view.settings.grid}
            center={live.center}
            size={live.size}
            echoes={echoes}
          />
        )}
      </Grid>
    </div>
  );
}
