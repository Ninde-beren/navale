import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { coordKey } from '@navale/engine';
import { coordLabel, type Coord, type PlayerView } from '@navale/protocol';
import { play } from '../../shared/audio.js';
import { ownGridClasses, publicGridClasses } from '../../shared/cells.js';
import { sendCommand } from '../../shared/socket.js';
import { useGame } from '../../shared/store.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { mmss, useCountdown } from '../../shared/useCountdown.js';

const RESULT = { MISS: 'RATÉ', HIT: 'TOUCHÉ', SUNK: 'COULÉ' } as const;

/** Téléphone pendant la partie : viser et tirer quand c'est mon tour, suivre ma flotte sinon. */
export function PlayPlaying({
  view,
  socket,
}: {
  view: PlayerView;
  socket: RefObject<Socket | null>;
}) {
  const me = view.players.find((p) => p.playerId === view.me.playerId)!;
  const byId = new Map(view.players.map((p) => [p.playerId, p]));
  const name = (id: string) => byId.get(id)?.name ?? '?';
  const active = view.round?.activePlayerId ? byId.get(view.round.activePlayerId) : undefined;
  const legal = view.me.legalTargets.map((id) => byId.get(id)).filter((p) => p !== undefined);

  const [targetId, setTargetId] = useState<string | null>(null);
  const [cell, setCell] = useState<Coord | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<'aim' | 'mine'>('aim');
  const [sent, setSent] = useState<number | null>(null); // manche du tir envoyé, en attente de l'écran
  const [error, setError] = useState<string | null>(null);
  const wasMyTurn = useRef(false);

  const roundIndex = view.round?.index ?? -1;
  const left = useCountdown(view.round?.deadline ?? null);
  const timer = left !== null ? ` · ${mmss(left)}` : '';
  const canFire = view.me.canFire && sent !== roundIndex;
  const target = (targetId ? byId.get(targetId) : undefined) ?? legal[0];
  const salvo = view.settings.variant === 'simultaneous';
  const events = useGame((s) => s.events);
  // La résolution de la manche a commencé sur l'écran central (l'instantané suivant n'est pas encore là).
  const resolving = events.some(
    (e) => e.event.type === 'SHOT_RESOLVED' && e.event.round === roundIndex,
  );
  // Qui a tiré dans la manche : l'instantané, complété par les SHOT_COMMITTED reçus depuis.
  const committed = new Set(view.round?.committed ?? []);
  for (const e of events)
    if (e.event.type === 'SHOT_COMMITTED' && e.event.round === roundIndex)
      committed.add(e.event.shooterId);

  // Vibration et deux notes quand mon tour arrive.
  useEffect(() => {
    if (view.me.canFire && !wasMyTurn.current) {
      navigator.vibrate?.([120, 60, 120]);
      play('turn');
    }
    wasMyTurn.current = view.me.canFire;
  }, [view.me.canFire]);
  // Nouvelle manche : on repart propre.
  useEffect(() => {
    setCell(null);
    setConfirming(false);
    setTab('aim');
  }, [roundIndex]);

  const fire = async () => {
    if (!target || !cell) return;
    setError(null);
    const ack = await sendCommand(socket.current, {
      type: 'FIRE',
      targetId: target.playerId,
      coord: cell,
    });
    setConfirming(false);
    if (ack.ok) setSent(roundIndex);
    else setError(ack.error.message);
  };

  const header = (
    <div className="flex items-center justify-between">
      <Wordmark />
      <span className="chip plain">{view.code}</span>
    </div>
  );
  const myShotsOn = (id: string) =>
    new Set(view.me.shotsFired.filter((s) => s.targetId === id).map((s) => coordKey(s.coord)));

  // ---- Fin de partie / éliminé ----
  if (view.status === 'FINISHED' || me.status === 'ELIMINATED') {
    const rank = me.rank ?? view.ranking?.find((r) => r.playerId === me.playerId)?.rank ?? null;
    const stats = view.ranking?.find((r) => r.playerId === me.playerId);
    return (
      <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 16 }}>
        {header}
        <div>
          <h1 className={`state ${rank === 1 ? 'me' : ''}`}>
            {view.status === 'FINISHED'
              ? rank === 1
                ? 'Victoire !'
                : `${rank ?? '?'}e sur ${view.players.length}`
              : 'Tu es éliminé'}
          </h1>
          <p className="muted">
            {view.status === 'FINISHED'
              ? 'La partie est terminée.'
              : 'La partie continue sans toi.'}
          </p>
        </div>
        <div className="flex justify-center">
          <Grid
            width={view.settings.grid.width}
            height={view.settings.grid.height}
            cellClass={ownGridClasses(view.me.fleet, me.revealed)}
            className="dim"
            label="Ma flotte"
          />
        </div>
        {stats && (
          <div className="panel flex flex-col gap-2">
            <div className="kv">
              <span>Tirs</span>
              <b>{stats.shotsFired}</b>
            </div>
            <div className="kv">
              <span>Touches</span>
              <b>{stats.hits}</b>
            </div>
            <div className="kv">
              <span>Précision</span>
              <b>{Math.round(stats.accuracy * 100)} %</b>
            </div>
            <div className="kv">
              <span>Coulés</span>
              <b>{stats.shipsSunk}</b>
            </div>
          </div>
        )}
        <a className="btn ghost" href={`/board/${view.code}`} target="_blank" rel="noreferrer">
          Regarder l'écran central
        </a>
      </div>
    );
  }

  // ---- Mon tour : viser ----
  if (canFire && target) {
    const mine = myShotsOn(target.playerId);
    const revealed = new Set(target.revealed.map((r) => coordKey(r.coord)));
    const classes = publicGridClasses(target.revealed, target.sunkShips);
    return (
      <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 14 }}>
        {header}
        <div>
          <h1 className="state me">À toi</h1>
          <p className="muted">
            Manche {roundIndex + 1} · choisis une cible, puis une case.{timer}
          </p>
        </div>
        <div className="tabs">
          <button type="button" className={tab === 'aim' ? 'on' : ''} onClick={() => setTab('aim')}>
            Viser
          </button>
          <button
            type="button"
            className={tab === 'mine' ? 'on' : ''}
            onClick={() => setTab('mine')}
          >
            Ma flotte
          </button>
        </div>
        {tab === 'mine' ? (
          <div className="flex justify-center">
            <Grid
              width={view.settings.grid.width}
              height={view.settings.grid.height}
              cellClass={ownGridClasses(view.me.fleet, me.revealed)}
              label="Ma flotte"
            />
          </div>
        ) : (
          <>
            {legal.length > 1 && (
              <div className="targets">
                {legal.map((p) => (
                  <button
                    key={p.playerId}
                    type="button"
                    className={`c-${p.color} ${p.playerId === target.playerId ? 'on' : ''}`}
                    onClick={() => {
                      setTargetId(p.playerId);
                      setCell(null);
                    }}
                  >
                    <Avatar
                      color={p.color}
                      initial={initialOf(p.name)}
                      size="sm"
                      bot={p.kind === 'bot'}
                    />
                    {p.name}
                    <small>
                      {p.shipsRemaining} bateau{p.shipsRemaining > 1 ? 'x' : ''}
                    </small>
                  </button>
                ))}
              </div>
            )}
            <div className={`flex justify-center c-${target.color}`}>
              <Grid
                width={view.settings.grid.width}
                height={view.settings.grid.height}
                label={`Grille de ${target.name}`}
                cellClass={(x, y) => {
                  const k = coordKey({ x, y });
                  return `${classes(x, y)} ${mine.has(k) ? 'mine' : ''} ${cell && cell.x === x && cell.y === y ? 'sel' : ''}`;
                }}
                onPointerUp={(c) => {
                  if (!c || revealed.has(coordKey(c))) return;
                  setCell(c);
                }}
              />
            </div>
            <p className="hint">
              {legal.length > 1 ? `Cible : ${target.name} · ` : ''}
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
              <p className="muted">
                Le tir est définitif. Regarde l'écran central pour le résultat.
              </p>
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
      </div>
    );
  }

  // ---- Salve : tir engagé, en attente des autres (E5-S7) ----
  const pending = view.me.pendingShot;
  const shooters = (view.round?.expectedShooters ?? [])
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined);
  const waitingFor = shooters.filter((p) => !committed.has(p.playerId)).length;
  if (salvo && (pending || sent === roundIndex) && !resolving) {
    const sealedTarget = pending ? byId.get(pending.targetId) : undefined;
    return (
      <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 14 }}>
        {header}
        <div>
          <h1 className="h1">Tir engagé</h1>
          <p className="muted">
            Manche {roundIndex + 1} · Salve ·{' '}
            {waitingFor > 0 ? (
              <>
                en attente de{' '}
                <b style={{ color: 'var(--text)' }}>
                  {waitingFor} joueur{waitingFor > 1 ? 's' : ''}
                </b>
              </>
            ) : (
              'tout le monde a tiré'
            )}
          </p>
        </div>
        <div className="panel waitrow">
          <div className="waiting">
            {shooters.map((p) => (
              <span
                key={p.playerId}
                className={committed.has(p.playerId) ? 'done' : 'pending'}
                title={`${p.name} · ${committed.has(p.playerId) ? 'a tiré' : 'choisit'}`}
              >
                <Avatar
                  color={p.color}
                  initial={initialOf(p.name)}
                  size="sm"
                  bot={p.kind === 'bot'}
                />
              </span>
            ))}
          </div>
          {left !== null && (
            <div className="tright">
              <div className="mono">{mmss(left)}</div>
              <div className="hint">avant résolution</div>
            </div>
          )}
        </div>
        {pending && (
          <div className={`panel sealed c-${sealedTarget?.color ?? me.color}`}>
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <div>
              <div className="line">
                Ton tir : <b className="mono">{coordLabel(pending.coord)}</b> sur{' '}
                <span className="pc">{name(pending.targetId)}</span>
              </div>
              <div className="hint">Scellé. Personne ne le voit avant la résolution.</div>
            </div>
          </div>
        )}
        <div className="flex justify-center">
          <Grid
            width={view.settings.grid.width}
            height={view.settings.grid.height}
            cellClass={ownGridClasses(view.me.fleet, me.revealed)}
            label="Ma flotte"
          />
        </div>
        <p className="look">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="12" rx="2" />
            <path d="M8 21h8" />
          </svg>
          La résolution se joue sur l'écran central.
        </p>
      </div>
    );
  }

  // ---- Attente ----
  const headline =
    pending || sent === roundIndex || resolving
      ? 'Regarde l’écran'
      : active
        ? `Au tour de ${active.name}`
        : 'Regarde l’écran';
  const sub = resolving
    ? salvo
      ? 'Résolution de la salve en cours'
      : 'Résolution du tir'
    : `Manche ${roundIndex + 1} · ${view.me.cellsRemaining} cases intactes${timer}`;
  return (
    <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 16 }}>
      {header}
      <div>
        <h1 className="state state-pulse">{headline}</h1>
        <p className="muted">{sub}</p>
      </div>
      <div className="flex justify-center">
        <Grid
          width={view.settings.grid.width}
          height={view.settings.grid.height}
          cellClass={ownGridClasses(view.me.fleet, me.revealed)}
          label="Ma flotte"
        />
      </div>
      <div className="panel flex flex-col gap-2">
        <span className="label">Mes derniers tirs</span>
        {[...view.me.shotsFired]
          .reverse()
          .slice(0, 5)
          .map((s, i) => (
            <div key={i} className="kv">
              <span>
                {name(s.targetId)} · {coordLabel(s.coord)}
              </span>
              <b className={`res ${s.result.toLowerCase()}`}>{RESULT[s.result]}</b>
            </div>
          ))}
        {view.me.shotsFired.length === 0 && <p className="hint">Aucun tir pour l'instant.</p>}
      </div>
    </div>
  );
}
