import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { coordLabel, type Coord, type PublicPlayer } from '@navale/protocol';
import { publicGridClasses } from '../../shared/cells.js';
import { sendCommand } from '../../shared/socket.js';
import { useGame, type View } from '../../shared/store.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { mmss, useCountdown } from '../../shared/useCountdown.js';
import { FxLayer } from './FxLayer.js';
import { ShotFx, type ShotFxShot } from './shotFx.js';

const VARIANT = { sequential: 'Tour par tour', simultaneous: 'Salve' } as const;
const END = {
  last_standing: 'Dernier survivant',
  first_fleet_sunk: 'Première flotte coulée',
} as const;
const RESULT = { MISS: 'RATÉ', HIT: 'TOUCHÉ', SUNK: 'COULÉ' } as const;

type Reveal = { coord: Coord; result: 'MISS' | 'HIT' };
type Callout = { word: string; where: string; cls: string } | null;

function Zone({
  p,
  active,
  seat,
  grid,
  extra,
  fresh,
}: {
  p: PublicPlayer;
  active: boolean;
  seat: number;
  grid: { width: number; height: number };
  extra: Reveal[];
  fresh: Coord | null;
}) {
  const classes = publicGridClasses([...p.revealed, ...extra], p.sunkShips, fresh);
  return (
    <section
      className={`zone c-${p.color} ${active ? 'active' : ''} ${p.status === 'ELIMINATED' ? 'out' : ''}`}
      data-seat={seat}
      data-player={p.playerId}
    >
      <div className="nameplate">
        <Avatar color={p.color} initial={initialOf(p.name)} bot={p.kind === 'bot'} />
        <h2>{p.name}</h2>
        {!p.connected && p.kind === 'human' && <span className="role">hors ligne</span>}
      </div>
      <Grid
        width={grid.width}
        height={grid.height}
        cellClass={classes}
        className={p.status === 'ELIMINATED' ? 'dim' : ''}
        label={`Grille de ${p.name}`}
      />
      {p.status === 'ELIMINATED' && (
        <div className="stamp">{p.rank ? `${p.rank}e` : 'Éliminé'}</div>
      )}
    </section>
  );
}

/** Plateau en partie : état public, « Au tour de », journal, et la séquence animée de chaque tir. */
export function BoardPlaying({
  view,
  socket,
  layout,
}: {
  view: View;
  socket: RefObject<Socket | null>;
  layout: 'p2' | 'p3' | '';
}) {
  const { settings, players, round, code } = view;
  const byId = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);
  const active = round?.activePlayerId ? byId.get(round.activePlayerId) : undefined;
  const name = (id: string) => byId.get(id)?.name ?? '?';

  const rootRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<ShotFx | null>(null);
  const lastSeq = useRef(0);
  const [reveals, setReveals] = useState<Record<string, Reveal[]>>({});
  const [fresh, setFresh] = useState<{ targetId: string; coord: Coord } | null>(null);
  const [callout, setCallout] = useState<Callout>(null);
  const events = useGame((s) => s.events);
  const left = useCountdown(round?.deadline ?? null);
  const timer = left !== null ? ` · ${mmss(left)}` : '';

  // Les révélations transitoires tombent dès qu'un instantané à jour arrive.
  useEffect(() => {
    setReveals({});
    setFresh(null);
  }, [view.seq]);

  useEffect(() => {
    const fx = new ShotFx(
      () => rootRef.current?.closest<HTMLElement>('.screen') ?? rootRef.current,
      {
        onImpact: (shot) => {
          setReveals((r) => ({
            ...r,
            [shot.targetId]: [
              ...(r[shot.targetId] ?? []),
              { coord: shot.coord, result: shot.result === 'MISS' ? 'MISS' : 'HIT' },
            ],
          }));
          setFresh({ targetId: shot.targetId, coord: shot.coord });
        },
        onCallout: (shot) =>
          setCallout(
            shot
              ? {
                  word: RESULT[shot.result],
                  where: `${coordLabel(shot.coord)} · ${name(shot.shooterId)} → ${name(shot.targetId)}`,
                  cls: shot.result.toLowerCase(),
                }
              : null,
          ),
      },
    );
    fxRef.current = fx;
    return () => {
      fx.dispose();
      fxRef.current = null;
    };
  }, []);

  // Chaque SHOT_RESOLVED reçu déclenche la séquence ; les éliminations s'affichent après.
  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;
    for (const env of events) {
      if (env.seq <= lastSeq.current) continue;
      lastSeq.current = env.seq;
      const e = env.event;
      if (e.type === 'SHOT_RESOLVED') {
        const shot: ShotFxShot = {
          shooterId: e.shooterId,
          targetId: e.targetId,
          coord: e.coord,
          result: e.result,
        };
        void fx.play(shot, settings.revealDelayMs, layout);
      } else if (e.type === 'PLAYER_ELIMINATED') {
        const who = name(e.playerId);
        void fx
          .play(
            {
              shooterId: e.playerId,
              targetId: e.playerId,
              coord: { x: -1, y: -1 },
              result: 'SUNK',
            },
            0,
            layout,
          )
          .catch(() => undefined);
        setTimeout(
          () => setCallout({ word: 'ÉLIMINÉ', where: `${who} · ${e.rank}e`, cls: 'sunk' }),
          50,
        );
        setTimeout(() => setCallout(null), 1600);
      }
    }
  }, [events]);

  return (
    <div className="board" ref={rootRef}>
      {players.map((p, i) => (
        <Zone
          key={p.playerId}
          p={p}
          seat={i}
          grid={settings.grid}
          active={!!active && active.playerId === p.playerId}
          extra={reveals[p.playerId] ?? []}
          fresh={fresh?.targetId === p.playerId ? fresh.coord : null}
        />
      ))}
      <aside className={`centre c-${active?.color ?? 'blue'}`}>
        <div className="top">
          <Wordmark />
          <span className="code">{code}</span>
          <span className="meta">
            <strong>Manche {(round?.index ?? 0) + 1}</strong> · {VARIANT[settings.variant]} ·{' '}
            {END[settings.endCondition]}
          </span>
        </div>
        <div className="turn">
          {settings.variant === 'sequential' && active ? (
            layout === 'p3' || layout === 'p2' ? (
              <>
                <Avatar color={active.color} initial={initialOf(active.name)} size="xl" />
                <div className="txt">
                  <span className="label">Au tour de</span>
                  <h3>{active.name}</h3>
                  <p className="sub">choisit sa cible{timer}</p>
                </div>
              </>
            ) : (
              <>
                <span className="label">Au tour de</span>
                <Avatar color={active.color} initial={initialOf(active.name)} size="xl" />
                <h3>{active.name}</h3>
                <p className="sub">choisit sa cible{timer}</p>
              </>
            )
          ) : (
            <>
              <span className="label">Ont tiré</span>
              <h3>
                {round?.committed.length ?? 0}/{round?.expectedShooters.length ?? 0}
              </h3>
              <p className="sub">
                {players
                  .filter(
                    (p) =>
                      round?.expectedShooters.includes(p.playerId) &&
                      !round.committed.includes(p.playerId),
                  )
                  .map((p) => p.name)
                  .join(', ') || 'résolution'}
                {timer}
              </p>
            </>
          )}
        </div>
        <div className={`callout big ${callout?.cls ?? ''} ${callout ? 'show' : ''}`}>
          <span className="word">{callout?.word ?? ''}</span>
          <span className="where">{callout?.where ?? ''}</span>
        </div>
        <div className="log">
          <span className="label">Derniers tirs</span>
          {[...view.lastShots].reverse().map((s, i) => (
            <div key={`${s.round}-${i}`} className="row">
              <Avatar
                color={byId.get(s.shooterId)?.color ?? 'red'}
                initial={initialOf(name(s.shooterId))}
                size="sm"
              />
              <span className="who">{name(s.shooterId)}</span>
              <span className="arrow">→</span>
              <Avatar
                color={byId.get(s.targetId)?.color ?? 'red'}
                initial={initialOf(name(s.targetId))}
                size="sm"
              />
              <span className="who">{name(s.targetId)}</span>
              <span className="coord">{coordLabel(s.coord)}</span>
              <span className={`res ${s.result.toLowerCase()}`}>{RESULT[s.result]}</span>
            </div>
          ))}
        </div>
        <div className="controls">
          {view.isHost && (
            <>
              <button
                className="btn ghost"
                onClick={() => void sendCommand(socket.current, { type: 'FORCE_ROUND' })}
              >
                {settings.variant === 'sequential' ? 'Passer le tour' : 'Résoudre la salve'}
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm('Annuler la partie pour tout le monde ?'))
                    void sendCommand(socket.current, { type: 'CANCEL_GAME' });
                }}
              >
                Annuler
              </button>
            </>
          )}
          <span className="foot">
            Suivre la partie : {location.host}/board/{code}
          </span>
        </div>
      </aside>
      <FxLayer />
    </div>
  );
}
