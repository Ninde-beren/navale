import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import clsx from 'clsx';
import { cellsOf, randomFleet, sameCoord, shipSize, validateFleet } from '@navale/engine';
import type {
  Coord,
  GameSettings,
  PlayerView,
  PublicPlayer,
  ShipPlacement,
} from '@navale/protocol';
import { placementClasses } from '../../shared/cells.js';
import { shipLabel } from '../../shared/labels.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { Grid } from '../../shared/ui/Grid.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { LeaveButton } from './LeaveButton.js';

/** Flotte de départ : les bateaux en lignes, en haut à gauche. Sert aussi à « Réinitialiser ». */
function stacked(settings: PlayerView['settings']): ShipPlacement[] {
  return settings.fleet.map((s, i) => ({
    type: s.type,
    bow: { x: 0, y: Math.min(i * 2, settings.grid.height - 1) },
    orientation: 'H',
  }));
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** Le même bateau, la proue ramenée pour qu'il tienne entier dans la grille. */
function keepInGrid(ship: ShipPlacement, settings: GameSettings): ShipPlacement {
  const size = shipSize(settings, ship.type);
  const { width, height } = settings.grid;
  return {
    ...ship,
    bow: {
      x: clamp(ship.bow.x, ship.orientation === 'H' ? width - size : width - 1),
      y: clamp(ship.bow.y, ship.orientation === 'V' ? height - size : height - 1),
    },
  };
}

export function Placement({
  view,
  me,
  socket,
}: {
  view: PlayerView;
  me: PublicPlayer;
  socket: SocketRef;
}) {
  const navigate = useNavigate();
  const { settings } = view;
  const [ships, setShips] = useState<ShipPlacement[]>(() =>
    view.me.fleet.length > 0
      ? view.me.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }))
      : randomFleet(settings, Math.random),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ ship: number; offset: number; from: Coord; moved: boolean } | null>(null);

  const validation = useMemo(() => validateFleet(settings, ships), [settings, ships]);
  const conflicts = useMemo(() => {
    const set = new Set<number>();
    if (!validation.ok) for (const e of validation.errors) for (const i of e.ships) set.add(i);
    return set;
  }, [validation]);

  const shipAt = (c: Coord): { index: number; offset: number } | null => {
    for (let i = ships.length - 1; i >= 0; i--) {
      const ship = ships[i]!;
      const offset = cellsOf(ship, shipSize(settings, ship.type)).findIndex((cell) =>
        sameCoord(cell, c),
      );
      if (offset >= 0) return { index: i, offset };
    }
    return null;
  };

  const replaceShip = (index: number, change: (ship: ShipPlacement) => ShipPlacement) => {
    setShips((prev) => {
      const ship = keepInGrid(change(prev[index]!), settings);
      if (sameCoord(ship.bow, prev[index]!.bow) && ship.orientation === prev[index]!.orientation)
        return prev;
      return prev.map((s, i) => (i === index ? ship : s));
    });
  };
  const moveShip = (index: number, bow: Coord) => replaceShip(index, (ship) => ({ ...ship, bow }));
  const rotate = (index: number) =>
    replaceShip(index, (ship) => ({ ...ship, orientation: ship.orientation === 'H' ? 'V' : 'H' }));

  const ready = async () => {
    if (!validation.ok) return;
    setBusy(true);
    setError(null);
    const placed = await sendCommand(socket.current, { type: 'PLACE_FLEET', ships });
    if (!placed.ok) {
      setError(placed.error.message);
      setBusy(false);
      return;
    }
    const readied = await sendCommand(socket.current, { type: 'SET_READY', ready: true });
    if (!readied.ok) setError(readied.error.message);
    setBusy(false);
  };

  return (
    <PhoneScreen code={view.code} color={me.color}>
      <div>
        <h1 className="h1">Place ta flotte</h1>
        <p className="hint">Glisse un bateau pour le déplacer, tape dessus pour le pivoter.</p>
      </div>
      <div className="grid-wrap flex justify-center">
        <Grid
          width={settings.grid.width}
          height={settings.grid.height}
          cellClass={placementClasses(settings, ships, selected, conflicts)}
          onPointerDown={(c, e) => {
            const hit = shipAt(c);
            if (!hit) return;
            setSelected(hit.index);
            drag.current = { ship: hit.index, offset: hit.offset, from: c, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(c) => {
            const d = drag.current;
            if (!d || !c) return;
            if (c.x !== d.from.x || c.y !== d.from.y) d.moved = true;
            const p = ships[d.ship]!;
            const bow =
              p.orientation === 'H' ? { x: c.x - d.offset, y: c.y } : { x: c.x, y: c.y - d.offset };
            moveShip(d.ship, bow);
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (d && !d.moved) rotate(d.ship);
          }}
        />
      </div>
      <div className="tray">
        {ships.map((s, i) => (
          <button
            key={i}
            type="button"
            className={clsx(selected === i && 'on', conflicts.has(i) && 'bad')}
            onClick={() => setSelected(i)}
          >
            <span className="ship-pill me">
              {Array.from({ length: shipSize(settings, s.type) }, (_, k) => (
                <i key={k} />
              ))}
            </span>
            {shipLabel(s.type)}
          </button>
        ))}
      </div>
      {!validation.ok && (
        <p className="hint err">
          {conflicts.size > 0
            ? 'Des bateaux se chevauchent ou sortent de la grille.'
            : 'Flotte incomplète.'}
        </p>
      )}
      {error && <p className="hint err">{error}</p>}
      <div className="ph-row">
        <button
          className="btn sm ghost"
          type="button"
          onClick={() => setShips(randomFleet(settings, Math.random))}
        >
          Placement auto
        </button>
        <button className="btn sm ghost" type="button" onClick={() => setShips(stacked(settings))}>
          Réinitialiser
        </button>
        <button
          className="btn sm ghost"
          type="button"
          disabled={selected === null}
          onClick={() => selected !== null && rotate(selected)}
        >
          Pivoter
        </button>
      </div>
      <button
        className="btn xl me"
        type="button"
        disabled={!validation.ok || busy}
        onClick={() => void ready()}
      >
        {busy ? 'Envoi…' : 'Prêt'}
      </button>
      <LeaveButton code={view.code} socket={socket} onLeft={() => void navigate('/')} />
    </PhoneScreen>
  );
}
