import { useState } from 'react';
import clsx from 'clsx';
import { coordKey, sameCoord } from '@navale/engine';
import {
  coordLabel,
  type Ack,
  type Coord,
  type PlayerView,
  type PublicPlayer,
} from '@navale/protocol';
import { publicGridClasses } from '../../shared/cells.js';
import { count } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { timerSuffix, useCountdown } from '../../shared/useCountdown.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/**
 * Mon tour : choisir une cible et une case, confirmer, tirer. Monté à neuf à chaque
 * manche (`key`), il repart sans case choisie ni confirmation ouverte.
 */
export function PlayAim({
  view,
  me,
  onFire,
}: {
  view: PlayerView;
  me: PublicPlayer;
  onFire: (targetId: string, coord: Coord) => Promise<Ack>;
}) {
  const { byId } = playerLookup(view.players);
  const targets = view.me.legalTargets.map((id) => byId.get(id)).filter((p) => p !== undefined);
  // Anti-acharnement : le joueur absent de la liste, et pourquoi.
  const blocked = view.me.antiFocusBlocked ? byId.get(view.me.antiFocusBlocked) : undefined;
  const streak = view.settings.antiFocusMaxStreak ?? 0;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [cell, setCell] = useState<Coord | null>(null);
  const [tab, setTab] = useState<'aim' | 'mine'>('aim');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(view.round?.deadline ?? null);

  const target = targets.find((p) => p.playerId === targetId) ?? targets[0];
  if (!target) return null;

  const fire = async () => {
    if (!cell) return;
    setError(null);
    const ack = await onFire(target.playerId, cell);
    setConfirming(false);
    if (!ack.ok) setError(ack.error.message);
  };

  return (
    <PhoneScreen code={view.code} color={me.color}>
      <div>
        <h1 className="state me">À toi</h1>
        <p className="muted">
          Manche {(view.round?.index ?? 0) + 1} · choisis une cible, puis une case.
          {timerSuffix(secondsLeft)}
        </p>
      </div>
      <div className="tabs">
        <button type="button" className={clsx(tab === 'aim' && 'on')} onClick={() => setTab('aim')}>
          Viser
        </button>
        <button
          type="button"
          className={clsx(tab === 'mine' && 'on')}
          onClick={() => setTab('mine')}
        >
          Ma flotte
        </button>
      </div>
      {tab === 'mine' ? (
        <MyFleetGrid view={view} me={me} />
      ) : (
        <>
          {targets.length > 1 && (
            <TargetPicker
              targets={targets}
              selected={target.playerId}
              onSelect={(playerId) => {
                setTargetId(playerId);
                setCell(null);
              }}
            />
          )}
          <TargetGrid view={view} target={target} cell={cell} onCell={setCell} />
          {blocked && (
            <p className="hint">
              {streak === 1
                ? `Tu viens de tirer sur ${blocked.name} : vise quelqu’un d’autre cette fois.`
                : `${streak} tirs de suite sur ${blocked.name} : vise quelqu’un d’autre.`}
            </p>
          )}
          <p className="hint">
            {targets.length > 1 ? `Cible : ${target.name} · ` : ''}
            {cell ? `case ${coordLabel(cell)}` : 'tape une case non révélée'}
          </p>
        </>
      )}
      {error && <p className="hint err">{error}</p>}
      <button
        className="btn xl me"
        type="button"
        disabled={!cell || tab === 'mine'}
        onClick={() => setConfirming(true)}
      >
        {cell ? `Tirer en ${coordLabel(cell)}` : 'Choisis une case'}
      </button>
      {confirming && cell && (
        <>
          <div className="sheet-scrim" onClick={() => setConfirming(false)} />
          <div className="sheet" role="dialog" aria-modal="true">
            <h2>
              Tirer en {coordLabel(cell)} sur {target.name} ?
            </h2>
            <p className="muted">Le tir est définitif. Regarde l'écran central pour le résultat.</p>
            <div className="ph-row">
              <button className="btn ghost" type="button" onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button className="btn me" type="button" onClick={() => void fire()}>
                Tirer
              </button>
            </div>
          </div>
        </>
      )}
    </PhoneScreen>
  );
}

function TargetPicker({
  targets,
  selected,
  onSelect,
}: {
  targets: PublicPlayer[];
  selected: string;
  onSelect: (playerId: string) => void;
}) {
  return (
    <div className="targets">
      {targets.map((p) => (
        <button
          key={p.playerId}
          type="button"
          className={clsx(`c-${p.color}`, p.playerId === selected && 'on')}
          onClick={() => onSelect(p.playerId)}
        >
          <PlayerAvatar player={p} size="sm" />
          {p.name}
          <small>{count(p.shipsRemaining, 'bateau', 'bateaux')}</small>
        </button>
      ))}
    </div>
  );
}

/** La grille de la cible : ce qui est révélé, mes tirs, et la case choisie. */
function TargetGrid({
  view,
  target,
  cell,
  onCell,
}: {
  view: PlayerView;
  target: PublicPlayer;
  cell: Coord | null;
  onCell: (cell: Coord) => void;
}) {
  const revealed = new Set(target.revealed.map((r) => coordKey(r.coord)));
  const mine = new Set(
    view.me.shotsFired.filter((s) => s.targetId === target.playerId).map((s) => coordKey(s.coord)),
  );
  const classes = publicGridClasses(target.revealed, target.sunkShips);
  return (
    <div className={`flex justify-center c-${target.color}`}>
      <Grid
        width={view.settings.grid.width}
        height={view.settings.grid.height}
        label={`Grille de ${target.name}`}
        cellClass={(x, y) =>
          clsx(
            classes(x, y),
            mine.has(coordKey({ x, y })) && 'mine',
            cell && sameCoord(cell, { x, y }) && 'sel',
          )
        }
        onPointerUp={(c) => {
          if (c && !revealed.has(coordKey(c))) onCell(c);
        }}
      />
    </div>
  );
}
