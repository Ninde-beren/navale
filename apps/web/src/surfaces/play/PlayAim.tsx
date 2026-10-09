import { useState } from 'react';
import clsx from 'clsx';
import { coordKey, radarZone, repairableCells, sameCoord } from '@navale/engine';
import {
  coordLabel,
  type Ability,
  type Ack,
  type Coord,
  type PlayerView,
  type PublicPlayer,
} from '@navale/protocol';
import { ownGridClasses, publicGridClasses } from '../../shared/cells.js';
import { ABILITY_LABELS, abilityHint, commanderOf, count } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { timerSuffix, useCountdown } from '../../shared/useCountdown.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/** Le verbe du bouton, selon l'action. */
function verbOf(ability: Ability | null): string {
  if (!ability) return 'Tirer';
  return ability.type === 'radar' ? 'Scanner' : ability.type === 'missile' ? 'Missile' : 'Réparer';
}

/**
 * Mon tour : choisir une cible et une case, confirmer, tirer ; ou, avec un
 * commandant, jouer sa capacité à la place du tir. Monté à neuf à chaque manche
 * (`key`), il repart sans case choisie ni confirmation ouverte.
 */
export function PlayAim({
  view,
  me,
  onFire,
  onAbility,
}: {
  view: PlayerView;
  me: PublicPlayer;
  onFire: (targetId: string, coord: Coord) => Promise<Ack>;
  onAbility: (targetId: string, coord: Coord) => Promise<Ack>;
}) {
  const { byId } = playerLookup(view.players);
  const legal = view.me.legalTargets.map((id) => byId.get(id)).filter((p) => p !== undefined);
  // Anti-acharnement : le joueur absent de la liste, et pourquoi.
  const blocked = view.me.antiFocusBlocked ? byId.get(view.me.antiFocusBlocked) : undefined;
  const streak = view.settings.antiFocusMaxStreak ?? 0;
  const commander = commanderOf(view.settings, me.commanderId);
  const available = view.me.canUseAbility && commander ? commander.ability : null;
  const [mode, setMode] = useState<'fire' | 'ability'>('fire');
  const ability = mode === 'ability' ? available : null;
  const repair = ability?.type === 'repair';
  // Le radar vise n'importe quel vivant ; le missile, comme un tir, les cibles légales.
  const targets =
    ability?.type === 'radar'
      ? view.players.filter((p) => p.status === 'ALIVE' && p.playerId !== me.playerId)
      : legal;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [cell, setCell] = useState<Coord | null>(null);
  const [tab, setTab] = useState<'aim' | 'mine'>('aim');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(view.round?.deadline ?? null);

  // Sans choix explicite, on reste sur la cible du dernier tir tant qu'elle est permise
  // (l'anti-acharnement peut l'interdire), sinon la première de la liste.
  const lastTarget = view.me.shotsFired.at(-1)?.targetId;
  const target =
    targets.find((p) => p.playerId === targetId) ??
    targets.find((p) => p.playerId === lastTarget) ??
    targets[0];
  if (!target) return null;
  // Mon dernier radar sur cette cible : sa zone reste dessinée sur la grille.
  const lastRadar = view.me.radarResults.filter((r) => r.targetId === target.playerId).at(-1);
  const zone = lastRadar ? radarZone(view.settings, lastRadar.center, lastRadar.size) : [];
  const verb = verbOf(ability);

  const act = async () => {
    if (!cell) return;
    setError(null);
    const ack = ability
      ? await onAbility(repair ? me.playerId : target.playerId, cell)
      : await onFire(target.playerId, cell);
    setConfirming(false);
    if (!ack.ok) setError(ack.error.message);
  };
  const toggleAbility = () => {
    setMode(ability ? 'fire' : 'ability');
    setCell(null);
    setTab('aim');
  };

  return (
    <PhoneScreen code={view.code} color={me.color}>
      <div>
        <h1 className="state me">À toi</h1>
        <p className="muted">
          Manche {(view.round?.index ?? 0) + 1} ·{' '}
          {repair ? 'choisis une case touchée à réparer.' : 'choisis une cible, puis une case.'}
          {timerSuffix(secondsLeft)}
        </p>
      </div>
      {!repair && (
        <div className="tabs">
          <button
            type="button"
            className={clsx(tab === 'aim' && 'on')}
            onClick={() => setTab('aim')}
          >
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
      )}
      {available && (
        <button
          type="button"
          className={clsx('btn sm', ability ? 'me' : 'ghost')}
          onClick={toggleAbility}
        >
          {ability
            ? 'Revenir au tir'
            : `${ABILITY_LABELS[available.type]} · ${count(me.abilityUsesLeft, 'usage')}`}
        </button>
      )}
      {ability && <p className="hint">{abilityHint(ability)}</p>}
      {repair ? (
        <RepairGrid view={view} me={me} cell={cell} onCell={setCell} />
      ) : tab === 'mine' ? (
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
          <TargetGrid
            view={view}
            target={target}
            cell={cell}
            zone={zone}
            allowRevealed={ability?.type === 'radar'}
            onCell={setCell}
          />
          {lastRadar && (
            <p className="hint">
              Radar autour de {coordLabel(lastRadar.center)} : {count(lastRadar.shipCells, 'case')}{' '}
              de navire.
            </p>
          )}
          {blocked && ability?.type !== 'radar' && (
            <p className="hint">
              {streak === 1
                ? `Tu viens de tirer sur ${blocked.name} : vise quelqu’un d’autre cette fois.`
                : `${streak} tirs de suite sur ${blocked.name} : vise quelqu’un d’autre.`}
            </p>
          )}
          <p className="hint">
            {targets.length > 1 ? `Cible : ${target.name} · ` : ''}
            {cell
              ? `case ${coordLabel(cell)}`
              : ability?.type === 'radar'
                ? 'tape le centre de la zone'
                : 'tape une case non révélée'}
          </p>
        </>
      )}
      {error && <p className="hint err">{error}</p>}
      <button
        className="btn xl me"
        type="button"
        disabled={!cell || (tab === 'mine' && !repair)}
        onClick={() => setConfirming(true)}
      >
        {cell
          ? `${verb} en ${coordLabel(cell)}`
          : repair
            ? 'Choisis une case touchée'
            : 'Choisis une case'}
      </button>
      {confirming && cell && (
        <>
          <div className="sheet-scrim" onClick={() => setConfirming(false)} />
          <div className="sheet" role="dialog" aria-modal="true">
            <h2>
              {repair
                ? `Réparer ${coordLabel(cell)} ?`
                : `${verb} en ${coordLabel(cell)} sur ${target.name} ?`}
            </h2>
            <p className="muted">
              {ability
                ? 'La capacité se joue à la place du tir. Regarde l’écran central.'
                : 'Le tir est définitif. Regarde l’écran central pour le résultat.'}
            </p>
            <div className="ph-row">
              <button className="btn ghost" type="button" onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button className="btn me" type="button" onClick={() => void act()}>
                {verb}
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

/** La grille de la cible : ce qui est révélé, mes tirs, la zone de mon dernier radar, et la case choisie. */
function TargetGrid({
  view,
  target,
  cell,
  zone,
  allowRevealed,
  onCell,
}: {
  view: PlayerView;
  target: PublicPlayer;
  cell: Coord | null;
  zone: Coord[];
  /** Le radar peut se centrer sur une case déjà révélée ; un tir, non. */
  allowRevealed: boolean;
  onCell: (cell: Coord) => void;
}) {
  const revealed = new Set(target.revealed.map((r) => coordKey(r.coord)));
  const mine = new Set(
    view.me.shotsFired.filter((s) => s.targetId === target.playerId).map((s) => coordKey(s.coord)),
  );
  const scanned = new Set(zone.map(coordKey));
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
            scanned.has(coordKey({ x, y })) && 'scan',
            cell && sameCoord(cell, { x, y }) && 'sel',
          )
        }
        onPointerUp={(c) => {
          if (c && (allowRevealed || !revealed.has(coordKey(c)))) onCell(c);
        }}
      />
    </div>
  );
}

/** Ma grille, pour choisir la case touchée à réparer : seules celles d'un bateau à flot répondent. */
function RepairGrid({
  view,
  me,
  cell,
  onCell,
}: {
  view: PlayerView;
  me: PublicPlayer;
  cell: Coord | null;
  onCell: (cell: Coord) => void;
}) {
  const classes = ownGridClasses(view.me.fleet, me.revealed);
  const repairable = repairableCells(view.me.fleet);
  return (
    <>
      <div className="flex justify-center">
        <Grid
          width={view.settings.grid.width}
          height={view.settings.grid.height}
          label="Ma flotte : choisis une case touchée"
          cellClass={(x, y) => clsx(classes(x, y), cell && sameCoord(cell, { x, y }) && 'sel')}
          onPointerUp={(c) => {
            if (c && repairable.some((r) => sameCoord(r, c))) onCell(c);
          }}
        />
      </div>
      {repairable.length === 0 && (
        <p className="hint">Aucune case touchée à réparer pour l’instant.</p>
      )}
    </>
  );
}
