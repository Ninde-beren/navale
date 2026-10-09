import type { CSSProperties } from 'react';
import clsx from 'clsx';

/**
 * Faux chargement au début de la partie : le fanion, la marque et une barre qui
 * se remplit pendant `duration`. Le temps que tout le monde lève les yeux.
 */
export function Splash({
  duration,
  title = 'La partie commence',
  phone = false,
}: {
  duration: number;
  title?: string;
  phone?: boolean;
}) {
  return (
    <div
      className={clsx('splash', phone && 'phone')}
      style={{ '--d': `${duration}ms` } as CSSProperties}
      role="status"
      aria-live="polite"
    >
      <span className="flag" aria-hidden="true" />
      <span className="name">NAVALE</span>
      <p className="sub">{title}</p>
      <div className="bar">
        <i />
      </div>
    </div>
  );
}
