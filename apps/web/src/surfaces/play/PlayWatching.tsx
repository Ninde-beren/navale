import { useEffect, useRef } from 'react';
import { coordLabel, type PlayerView, type PublicPlayer, type RadarResult } from '@navale/protocol';
import { groupBursts } from '../../shared/bursts.js';
import { RESULT_LABELS, detectionBrief } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { timerSuffix, useCountdown } from '../../shared/useCountdown.js';
import { MyFleetGrid } from './MyFleetGrid.js';
import { TargetGrid } from './TargetGrid.js';

/**
 * Ce n'est pas mon tour, ou mon tir est parti : ma flotte, ce que mes détections ont vu
 * (la grille de leur dernière cible, où balaie le radar que je viens de jouer), mes
 * derniers tirs, et l'écran central à regarder.
 */
export function PlayWatching({
  view,
  me,
  sweeping,
  shotSent,
  resolving,
}: {
  view: PlayerView;
  me: PublicPlayer;
  /** Mon radar qui vient d'arriver et balaie encore (`useRadarSweep`). */
  sweeping: RadarResult | null;
  /** Mon tir de la manche est parti : le résultat se joue sur l'écran central. */
  shotSent: boolean;
  /** L'écran central a commencé à résoudre la manche. */
  resolving: boolean;
}) {
  const { byId, nameOf } = playerLookup(view.players);
  const secondsLeft = useCountdown(view.round?.deadline ?? null);
  const active = view.round?.activePlayerId ? byId.get(view.round.activePlayerId) : undefined;
  const salvo = view.settings.variant === 'simultaneous';

  const headline =
    !shotSent && !resolving && active ? `Au tour de ${active.name}` : 'Regarde l’écran';
  const detail = resolving
    ? salvo
      ? 'Résolution de la salve en cours'
      : 'Résolution du tir'
    : `Manche ${(view.round?.index ?? 0) + 1} · ${view.me.cellsRemaining} cases intactes${timerSuffix(secondsLeft)}`;
  const lastShots = groupBursts(view.me.shotsFired).reverse().slice(0, 5);
  const radars = [...view.me.radarResults].reverse().slice(0, 3);
  const scanned = radars[0] && byId.get(radars[0].targetId);
  // Le balayage se joue sous ma flotte : on le fait venir à l'écran quand il commence.
  const detections = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sweeping) detections.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [sweeping]);

  return (
    <PhoneScreen code={view.code} color={me.color} gap={16}>
      <div>
        <h1 className="state state-pulse">{headline}</h1>
        <p className="muted">{detail}</p>
      </div>
      <MyFleetGrid view={view} me={me} />
      {radars.length > 0 && (
        <div ref={detections} className="panel flex flex-col gap-2">
          <span className="label">Mes détections</span>
          {scanned && (
            <TargetGrid
              view={view}
              target={scanned}
              radars={view.me.radarResults.filter((r) => r.targetId === scanned.playerId)}
              sweeping={sweeping}
              className="mini"
            />
          )}
          {radars.map((r) => (
            <div key={`${r.round}-${r.targetId}`} className="kv">
              <span>
                {nameOf(r.targetId)} · {r.ability === 'sonar' ? 'sonar' : 'radar'} autour de{' '}
                {coordLabel(r.center)}
              </span>
              <b>{detectionBrief(r)}</b>
            </div>
          ))}
        </div>
      )}
      <div className="panel flex flex-col gap-2">
        <span className="label">Mes derniers tirs</span>
        {lastShots.map((s) => (
          <div key={`${s.round}-${coordLabel(s.coord)}-${s.targetId}`} className="kv">
            <span>
              {nameOf(s.targetId)} · {s.burstSize ? 'missile ' : ''}
              {coordLabel(s.coord)}
            </span>
            <b className={`res ${s.result.toLowerCase()}`}>{RESULT_LABELS[s.result]}</b>
          </div>
        ))}
        {lastShots.length === 0 && <p className="hint">Aucun tir pour l'instant.</p>}
      </div>
    </PhoneScreen>
  );
}
