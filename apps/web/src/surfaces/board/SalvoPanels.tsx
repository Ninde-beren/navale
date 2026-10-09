import clsx from 'clsx';
import type { PublicPlayer } from '@navale/protocol';
import { ordinal } from '../../shared/labels.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { mmss, timerSuffix } from '../../shared/useCountdown.js';
import type { SalvoStep } from './useShotSequence.js';

const Check = () => (
  <svg
    className="ico"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

/** Salve, avant la résolution : qui a déjà tiré, dans quel ordre, et le chrono. */
export function SalvoCollect({
  shooters,
  committed,
  secondsLeft,
  compact,
}: {
  shooters: PublicPlayer[];
  /** Dans l'ordre d'engagement : le premier de la liste a tiré le premier. */
  committed: string[];
  secondsLeft: number | null;
  compact: boolean;
}) {
  const fired = shooters.filter((p) => committed.includes(p.playerId)).length;
  const waiting = shooters.filter((p) => !committed.includes(p.playerId));
  if (compact) {
    return (
      <div className="turn salvo dimmable">
        <div className="txt">
          <span className="label">Ont tiré</span>
          <h3>
            {fired}/{shooters.length}
          </h3>
          <p className="sub">
            {waiting.map((p) => p.name).join(', ') || 'résolution'}
            {timerSuffix(secondsLeft)}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="turn salvo dimmable">
      <div className="counter">
        <div className="big">
          <b>{fired}</b>
          <small>/{shooters.length}</small>
        </div>
        <div className="sub">ont tiré</div>
      </div>
      <div className="commits">
        {shooters.map((p) => {
          const order = committed.indexOf(p.playerId);
          return (
            <div key={p.playerId} className={clsx('row', `c-${p.color}`, order < 0 && 'wait')}>
              <PlayerAvatar player={p} size="sm" />
              <span>{p.name}</span>
              <span className="st">
                {order >= 0 ? (
                  <>
                    <Check /> {ordinal(order + 1)}
                  </>
                ) : (
                  'Choisit…'
                )}
              </span>
            </div>
          );
        })}
      </div>
      {secondsLeft !== null && (
        <div className="timer">
          <div className="t">{mmss(secondsLeft)}</div>
          <div className="l">avant résolution automatique</div>
        </div>
      )}
    </div>
  );
}

/** Salve, pendant la résolution : « tir 2 sur 4, de Julie ». */
export function SalvoResolving({
  step,
  total,
  shooterName,
}: {
  step: SalvoStep;
  total: number;
  shooterName: string;
}) {
  return (
    <div className="resolving show">
      <span className="label">Résolution</span>
      <div className="step">
        <b>{step.step}</b>
        <small>/{total}</small>
      </div>
      <div className="who">Tir de {shooterName}</div>
    </div>
  );
}
