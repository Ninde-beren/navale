import { useMemo, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { useNavigate } from 'react-router';
import { cellsOf, randomFleet, validateFleet } from '@navale/engine';
import {
  SHIP_LABELS_FR,
  type Coord,
  type FleetError,
  type PlayerView,
  type ShipPlacement,
} from '@navale/protocol';
import { placementClasses } from '../../shared/cells.js';
import { sendCommand } from '../../shared/socket.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
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

export function Placement({
  view,
  socket,
}: {
  view: PlayerView;
  socket: RefObject<Socket | null>;
}) {
  const navigate = useNavigate();
  const { settings } = view;
  const me = view.players.find((p) => p.playerId === view.me.playerId)!;
  const [ships, setShips] = useState<ShipPlacement[]>(() =>
    view.me.fleet.length > 0
      ? view.me.fleet.map((s) => ({ type: s.type, bow: s.bow, orientation: s.orientation }))
      : randomFleet(settings, Math.random),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ ship: number; offset: number; from: Coord; moved: boolean } | null>(null);
  const sizeOf = (type: string) => settings.fleet.find((s) => s.type === type)?.size ?? 1;

  const validation = useMemo(() => validateFleet(settings, ships), [settings, ships]);
  const conflicts = useMemo(() => {
    const set = new Set<number>();
    if (!validation.ok)
      for (const e of validation.errors as FleetError[]) for (const i of e.ships) set.add(i);
    return set;
  }, [validation]);

  const shipAt = (c: Coord): { index: number; offset: number } | null => {
    for (let i = ships.length - 1; i >= 0; i--) {
      const p = ships[i]!;
      const cells = cellsOf(p, sizeOf(p.type));
      const k = cells.findIndex((cell) => cell.x === c.x && cell.y === c.y);
      if (k >= 0) return { index: i, offset: k };
    }
    return null;
  };

  const moveShip = (index: number, bow: Coord) => {
    setShips((prev) => {
      const p = prev[index]!;
      const size = sizeOf(p.type);
      const x = clamp(
        bow.x,
        p.orientation === 'H' ? settings.grid.width - size : settings.grid.width - 1,
      );
      const y = clamp(
        bow.y,
        p.orientation === 'V' ? settings.grid.height - size : settings.grid.height - 1,
      );
      if (x === p.bow.x && y === p.bow.y) return prev;
      return prev.map((s, i) => (i === index ? { ...s, bow: { x, y } } : s));
    });
  };

  const rotate = (index: number) => {
    setShips((prev) => {
      const p = prev[index]!;
      const size = sizeOf(p.type);
      const orientation = p.orientation === 'H' ? 'V' : 'H';
      const x = clamp(
        p.bow.x,
        orientation === 'H' ? settings.grid.width - size : settings.grid.width - 1,
      );
      const y = clamp(
        p.bow.y,
        orientation === 'V' ? settings.grid.height - size : settings.grid.height - 1,
      );
      return prev.map((s, i) => (i === index ? { ...s, orientation, bow: { x, y } } : s));
    });
  };

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
    const r = await sendCommand(socket.current, { type: 'SET_READY', ready: true });
    if (!r.ok) setError(r.error.message);
    setBusy(false);
  };

  return (
    <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 14 }}>
      <div className="flex items-center justify-between">
        <Wordmark />
        <span className="chip plain">{view.code}</span>
      </div>
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
            className={`${selected === i ? 'on' : ''} ${conflicts.has(i) ? 'bad' : ''}`}
            onClick={() => setSelected(i)}
          >
            <span className="ship-pill me">
              {Array.from({ length: sizeOf(s.type) }, (_, k) => (
                <i key={k} />
              ))}
            </span>
            {SHIP_LABELS_FR[s.type] ?? s.type}
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
    </div>
  );
}
