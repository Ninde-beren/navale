import type { Coord } from '@navale/protocol';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface GridProps {
  width: number;
  height: number;
  /** Classes de la case `(x, y)` : `miss`, `hit`, `sunk hs`, `ship vm`… */
  cellClass: (x: number, y: number) => string;
  className?: string;
  onPointerDown?: (c: Coord, e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove?: (c: Coord | null, e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (c: Coord | null, e: ReactPointerEvent<HTMLElement>) => void;
  label?: string;
}

/** Vraie grille CSS, avec les libellés A–H / 1–8. Une case non révélée est toujours identique aux autres. */
export function Grid({
  width,
  height,
  cellClass,
  className = '',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  label,
}: GridProps) {
  const cols = Array.from({ length: width }, (_, i) => String.fromCharCode(65 + i));
  const rows = Array.from({ length: height }, (_, i) => i + 1);
  const coordAt = (e: ReactPointerEvent<HTMLElement>): Coord | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest<HTMLElement>('[data-x]');
    if (!cell) return null;
    return { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
  };
  return (
    <div
      className={`grid ${className}`}
      style={{ '--cols': width, '--rows': height } as React.CSSProperties}
      role="img"
      aria-label={label ?? `Grille ${width}×${height}`}
      onPointerDown={
        onPointerDown
          ? (e) => {
              const c = coordAt(e);
              if (c) onPointerDown(c, e);
            }
          : undefined
      }
      onPointerMove={onPointerMove ? (e) => onPointerMove(coordAt(e), e) : undefined}
      onPointerUp={onPointerUp ? (e) => onPointerUp(coordAt(e), e) : undefined}
      onPointerCancel={onPointerUp ? (e) => onPointerUp(null, e) : undefined}
    >
      <b className="lbl" />
      {cols.map((c) => (
        <b key={c} className="lbl">
          {c}
        </b>
      ))}
      {rows.map((r, y) => (
        <FragmentRow key={r} r={r} y={y} width={width} cellClass={cellClass} />
      ))}
    </div>
  );
}

function FragmentRow({
  r,
  y,
  width,
  cellClass,
}: {
  r: number;
  y: number;
  width: number;
  cellClass: GridProps['cellClass'];
}) {
  return (
    <>
      <b className="lbl">{r}</b>
      {Array.from({ length: width }, (_, x) => (
        <i key={x} className={`cell ${cellClass(x, y)}`} data-x={x} data-y={y} />
      ))}
    </>
  );
}
