import { useState } from 'react';
import clsx from 'clsx';
import {
  SELF_ABILITIES,
  coordKey,
  decoyCells,
  radarZone,
  repairableCells,
  sameCoord,
  shieldCovers,
} from '@navale/engine';
import {
  coordLabel,
  type Ability,
  type Ack,
  type Coord,
  type PlayerView,
  type PublicPlayer,
  type RadarResult,
} from '@navale/protocol';
import { ownGridClasses, publicGridClasses } from '../../shared/cells.js';
import { ABILITY_LABELS, abilityHint, commanderOf, count } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { timerSuffix, useCountdown } from '../../shared/useCountdown.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/** Le bouton principal : ce que fait l'action, sur quelle case. */
function actionLabel(ability: Ability | null, cell: string): string {
  switch (ability?.type) {
    case undefined:
      return `Tirer en ${cell}`;
    case 'radar':
      return `Scanner en ${cell}`;
    case 'sonar':
      return `Sonder en ${cell}`;
    case 'missile':
      return `Missile en ${cell}`;
    case 'repair':
      return `Réparer ${cell}`;
    case 'shield':
      return `Protéger autour de ${cell}`;
    case 'decoy':
      return `Leurre en ${cell}`;
  }
}

/** Le verbe du bouton de confirmation. */
function verbOf(ability: Ability | null): string {
  switch (ability?.type) {
    case undefined:
      return 'Tirer';
    case 'radar':
      return 'Scanner';
    case 'sonar':
      return 'Sonder';
    case 'missile':
      return 'Missile';
    case 'repair':
      return 'Réparer';
    case 'shield':
      return 'Protéger';
    case 'decoy':
      return 'Poser';
  }
}

/** Ce qu'on demande de choisir, sur sa propre grille. */
const SELF_PROMPTS: Partial<Record<Ability['type'], string>> = {
  repair: 'choisis une case touchée à réparer.',
  shield: 'choisis le centre de la zone à protéger.',
  decoy: 'choisis une case vide pour ton leurre.',
};

/**
 * Mon tour : choisir une cible et une case, confirmer, tirer ; ou, avec un
 * commandant, jouer sa capacité à la place du tir, chez un adversaire (radar, sonar,
 * missile) ou sur ma propre flotte (réparation, bouclier, leurre). Monté à neuf à
 * chaque manche (`key`), il repart sans case choisie ni confirmation ouverte.
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
  const self = ability !== null && SELF_ABILITIES.has(ability.type);
  const detector = ability?.type === 'radar' || ability?.type === 'sonar';
  // Radar et sonar visent n'importe quel vivant ; le missile, comme un tir, les cibles légales.
  const targets = detector
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
  // Mes radars et sonars sur cette cible : les navires ne bougent pas, ce qu'ils ont vu reste vrai.
  const radars = view.me.radarResults.filter((r) => r.targetId === target.playerId);
  const lastRadar = radars.at(-1);
  const label = cell ? coordLabel(cell) : '';

  const act = async () => {
    if (!cell) return;
    setError(null);
    const ack = ability
      ? await onAbility(self ? me.playerId : target.playerId, cell)
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
          {self && ability
            ? SELF_PROMPTS[ability.type]
            : detector
              ? 'choisis une cible, puis le centre de la zone.'
              : 'choisis une cible, puis une case.'}
          {timerSuffix(secondsLeft)}
        </p>
      </div>
      {!self && (
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
      {self && ability ? (
        <OwnGrid view={view} me={me} ability={ability} cell={cell} onCell={setCell} />
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
            radars={radars}
            allowRevealed={detector}
            allowShielded={ability !== null}
            onCell={setCell}
          />
          {lastRadar && (
            <p className="hint">
              {lastRadar.ability === 'sonar' ? 'Sonar' : 'Radar'} autour de{' '}
              {coordLabel(lastRadar.center)} : {count(lastRadar.shipCells, 'case')} de navire
              {lastRadar.contacts
                ? '. Rond vert : navire détecté ; pointillés : de l’eau.'
                : ' dans la zone en pointillés.'}
            </p>
          )}
          {target.shield && (
            <p className="hint">
              Bouclier de {target.name} : la zone bleue est protégée jusqu’à son prochain tour.
            </p>
          )}
          {blocked && !detector && (
            <p className="hint">
              {streak === 1
                ? `Tu viens de tirer sur ${blocked.name} : vise quelqu’un d’autre cette fois.`
                : `${streak} tirs de suite sur ${blocked.name} : vise quelqu’un d’autre.`}
            </p>
          )}
          <p className="hint">
            {targets.length > 1 ? `Cible : ${target.name} · ` : ''}
            {cell
              ? `case ${label}`
              : detector
                ? 'tape le centre de la zone'
                : 'tape une case non révélée'}
          </p>
        </>
      )}
      {error && <p className="hint err">{error}</p>}
      <button
        className="btn xl me"
        type="button"
        disabled={!cell || (tab === 'mine' && !self)}
        onClick={() => setConfirming(true)}
      >
        {cell ? actionLabel(ability, label) : 'Choisis une case'}
      </button>
      {confirming && cell && (
        <>
          <div className="sheet-scrim" onClick={() => setConfirming(false)} />
          <div className="sheet" role="dialog" aria-modal="true">
            <h2>
              {self
                ? `${actionLabel(ability, label)} ?`
                : `${actionLabel(ability, label)} sur ${target.name} ?`}
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
                {verbOf(ability)}
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

/**
 * La grille de la cible : ce qui est révélé, mes tirs, son bouclier, ce que mes radars
 * ont vu (navire détecté, ou eau) et la case choisie. Un sonar, ou un radar d'avant les
 * contacts, ne donne qu'un total : sa zone reste en pointillés, sans détail.
 */
function TargetGrid({
  view,
  target,
  cell,
  radars,
  allowRevealed,
  allowShielded,
  onCell,
}: {
  view: PlayerView;
  target: PublicPlayer;
  cell: Coord | null;
  radars: RadarResult[];
  /** Radar et sonar peuvent se centrer sur une case déjà révélée ; un tir, non. */
  allowRevealed: boolean;
  /** Une capacité peut viser sous un bouclier (le moteur dit si elle y sert) ; un tir, non. */
  allowShielded: boolean;
  onCell: (cell: Coord) => void;
}) {
  const revealed = new Set(target.revealed.map((r) => coordKey(r.coord)));
  const mine = new Set(
    view.me.shotsFired.filter((s) => s.targetId === target.playerId).map((s) => coordKey(s.coord)),
  );
  const scanned = new Set<string>();
  const contacts = new Set<string>();
  const unknown = new Set<string>();
  for (const r of radars) {
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
  const shielded = target.shield
    ? radarZone(view.settings, target.shield.center, target.shield.size)
    : [];
  const classes = publicGridClasses(target.revealed, target.sunkShips, null, shielded);
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
            radarClass(coordKey({ x, y })),
            cell && sameCoord(cell, { x, y }) && 'sel',
          )
        }
        onPointerUp={(c) => {
          if (!c) return;
          if (!allowRevealed && revealed.has(coordKey(c))) return;
          if (!allowShielded && shieldCovers(target.shield, c)) return;
          onCell(c);
        }}
      />
    </div>
  );
}

/**
 * Ma grille, pour une capacité qui se joue sur ma flotte : seules les cases utiles
 * répondent (une case touchée d'un bateau à flot pour réparer, une case vide jamais
 * visée pour un leurre, n'importe laquelle pour centrer un bouclier, dont la zone se dessine).
 */
function OwnGrid({
  view,
  me,
  ability,
  cell,
  onCell,
}: {
  view: PlayerView;
  me: PublicPlayer;
  ability: Ability;
  cell: Coord | null;
  onCell: (cell: Coord) => void;
}) {
  const { settings } = view;
  const myShield = me.shield ? radarZone(settings, me.shield.center, me.shield.size) : [];
  const classes = ownGridClasses(view.me.fleet, me.revealed, {
    decoys: view.me.decoys,
    shielded: myShield,
  });
  const allowed =
    ability.type === 'repair'
      ? repairableCells(view.me.fleet)
      : ability.type === 'decoy'
        ? decoyCells(settings, view.me.fleet, me.revealed, view.me.decoys)
        : null;
  const zone = new Set(
    ability.type === 'shield' && cell ? radarZone(settings, cell, ability.size).map(coordKey) : [],
  );
  return (
    <>
      <div className="flex justify-center">
        <Grid
          width={settings.grid.width}
          height={settings.grid.height}
          label="Ma flotte : choisis une case"
          cellClass={(x, y) =>
            clsx(
              classes(x, y),
              zone.has(coordKey({ x, y })) && 'scan',
              cell && sameCoord(cell, { x, y }) && 'sel',
            )
          }
          onPointerUp={(c) => {
            if (c && (!allowed || allowed.some((a) => sameCoord(a, c)))) onCell(c);
          }}
        />
      </div>
      {allowed?.length === 0 && (
        <p className="hint">
          {ability.type === 'repair'
            ? 'Aucune case touchée à réparer pour l’instant.'
            : 'Plus aucune case libre pour un leurre.'}
        </p>
      )}
    </>
  );
}
