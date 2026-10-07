/** Calque des effets de tir : trajectoire, missile, explosion, plouf. Piloté par `ShotFx`. */
export function FxLayer() {
  const sparks = Array.from({ length: 8 }, (_, i) => (
    <g key={i} className="spark" style={{ '--a': `${i * 45}deg` } as React.CSSProperties}>
      <line x1="0" y1="-14" x2="0" y2="-38" />
    </g>
  ));
  const drops = [
    [6, -26, -52, 0],
    [5, -12, -74, 40],
    [7, 2, -88, 20],
    [5, 16, -70, 60],
    [6, 30, -48, 30],
    [4, -38, -30, 80],
    [4, 40, -34, 70],
  ].map(([r, dx, h, d], i) => (
    <circle
      key={i}
      className="drop"
      r={r}
      style={{ '--dx': `${dx}px`, '--h': `${h}px`, '--d': `${d}ms` } as React.CSSProperties}
    />
  ));
  return (
    <>
      <svg className="fx" viewBox="0 0 1920 1080" aria-hidden="true">
        <path className="trail-glow" d="M0 0" />
        <path className="trail" d="M0 0" />
        <path className="hot" d="M0 0" />
        <g className="boom" transform="translate(-200 -200)">
          <circle className="smoke" r="40" />
          <circle className="smoke s2" r="40" />
          {sparks}
          <circle className="fire f1" r="46" />
          <circle className="fire f2" r="34" />
          <circle className="fire f3" r="20" />
          <circle className="flash" r="52" />
        </g>
        <g className="splash" transform="translate(-200 -200)">
          <circle className="ripple r1" r="26" />
          <circle className="ripple r2" r="26" />
          <circle className="ripple r3" r="26" />
          {drops}
          <circle className="plop" r="16" />
        </g>
      </svg>
      <div className="missile" aria-hidden="true" />
    </>
  );
}
