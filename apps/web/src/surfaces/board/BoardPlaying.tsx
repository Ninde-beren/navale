import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { coordLabel, type Coord, type PublicPlayer, type PublicRound } from '@navale/protocol';
import { play } from '../../shared/audio.js';
import { publicGridClasses } from '../../shared/cells.js';
import { sendCommand } from '../../shared/socket.js';
import { useGame, type View } from '../../shared/store.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { SoundButton } from '../../shared/ui/SoundButton.js';
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
const SOUND = { MISS: 'miss', HIT: 'hit', SUNK: 'sunk' } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Reveal = { coord: Coord; result: 'MISS' | 'HIT' };
type Callout = { word: string; where: string; cls: string } | null;
/** Rafale en cours : manche, tir en cours de résolution, tireur. */
type Salvo = { round: number; step: number; shooterId: string };

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

/** Scène centrale en salve : la collecte des tirs (qui a tiré, chrono), avant la rafale de résolutions. */
function SalvoCollect({
  shooters,
  committed,
  left,
  compact,
}: {
  shooters: PublicPlayer[];
  committed: Set<string>;
  left: number | null;
  compact: boolean;
}) {
  const n = shooters.filter((p) => committed.has(p.playerId)).length;
  const waiting = shooters.filter((p) => !committed.has(p.playerId));
  if (compact) {
    return (
      <div className="turn salvo dimmable">
        <div className="txt">
          <span className="label">Ont tiré</span>
          <h3>
            {n}/{shooters.length}
          </h3>
          <p className="sub">
            {waiting.map((p) => p.name).join(', ') || 'résolution'}
            {left !== null ? ` · ${mmss(left)}` : ''}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="turn salvo dimmable">
      <div className="counter">
        <div className="big">
          <b>{n}</b>
          <small>/{shooters.length}</small>
        </div>
        <div className="sub">ont tiré</div>
      </div>
      <div className="commits">
        {shooters.map((p) => {
          const fired = committed.has(p.playerId);
          return (
            <div key={p.playerId} className={`row c-${p.color} ${fired ? '' : 'wait'}`}>
              <Avatar
                color={p.color}
                initial={initialOf(p.name)}
                size="sm"
                bot={p.kind === 'bot'}
              />
              <span>{p.name}</span>
              <span className="st">
                {fired ? (
                  <>
                    <Check /> A tiré
                  </>
                ) : (
                  'Choisit…'
                )}
              </span>
            </div>
          );
        })}
      </div>
      {left !== null && (
        <div className="timer">
          <div className="t">{mmss(left)}</div>
          <div className="l">avant résolution automatique</div>
        </div>
      )}
    </div>
  );
}

function Resolving({ salvo, total, name }: { salvo: Salvo; total: number; name: string }) {
  return (
    <div className="resolving show">
      <span className="label">Résolution</span>
      <div className="step">
        <b>{salvo.step}</b>
        <small>/{total}</small>
      </div>
      <div className="who">Tir de {name}</div>
    </div>
  );
}

/** Qui a déjà tiré dans la manche : l'instantané, complété par les SHOT_COMMITTED reçus depuis. */
function committedIn(
  round: PublicRound | null,
  events: ReturnType<typeof useGame.getState>['events'],
): Set<string> {
  const set = new Set(round?.committed ?? []);
  if (round)
    for (const env of events)
      if (env.event.type === 'SHOT_COMMITTED' && env.event.round === round.index)
        set.add(env.event.shooterId);
  return set;
}

/** Plateau en partie : état public, « Au tour de » ou collecte de la salve, journal, et la séquence animée de chaque tir. */
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
  const compact = layout === 'p2' || layout === 'p3';

  const rootRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<ShotFx | null>(null);
  const lastSeq = useRef(0);
  const [reveals, setReveals] = useState<Record<string, Reveal[]>>({});
  const [fresh, setFresh] = useState<{ targetId: string; coord: Coord } | null>(null);
  const [callout, setCallout] = useState<Callout>(null);
  const [salvo, setSalvo] = useState<Salvo | null>(null);
  const events = useGame((s) => s.events);
  const left = useCountdown(round?.deadline ?? null);
  const timer = left !== null ? ` · ${mmss(left)}` : '';

  const roundIndex = round?.index ?? -1;
  const isSalvo = settings.variant === 'simultaneous';
  const committed = useMemo(() => committedIn(round, events), [round, events]);
  const shooters = (round?.expectedShooters ?? [])
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined);
  const resolving = isSalvo && salvo !== null && salvo.round === roundIndex ? salvo : null;

  // Les révélations transitoires tombent dès qu'un instantané à jour arrive.
  useEffect(() => {
    setReveals({});
    setFresh(null);
  }, [view.seq]);

  useEffect(() => {
    const fx = new ShotFx(
      () => rootRef.current?.closest<HTMLElement>('.screen') ?? rootRef.current,
      {
        onLaunch: (shot) => {
          play('launch');
          setSalvo((s) => ({
            round: shot.round,
            step: s && s.round === shot.round ? s.step + 1 : 1,
            shooterId: shot.shooterId,
          }));
        },
        onImpact: (shot) => {
          play(SOUND[shot.result]);
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

  // Chaque SHOT_RESOLVED reçu rejoint la file d'animation, dans l'ordre ; les éliminations s'annoncent après.
  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;
    for (const env of events) {
      if (env.seq <= lastSeq.current) continue;
      lastSeq.current = env.seq;
      const e = env.event;
      if (e.type === 'SHOT_RESOLVED') {
        const shot: ShotFxShot = {
          round: e.round,
          shooterId: e.shooterId,
          targetId: e.targetId,
          coord: e.coord,
          result: e.result,
        };
        void fx.play(shot, settings.revealDelayMs);
      } else if (e.type === 'PLAYER_ELIMINATED') {
        const who = name(e.playerId);
        void fx.enqueue(async () => {
          play('eliminated');
          setCallout({ word: 'ÉLIMINÉ', where: `${who} · ${e.rank}e`, cls: 'sunk' });
          await sleep(1600);
          setCallout(null);
        });
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
          active={
            isSalvo
              ? round?.expectedShooters.includes(p.playerId) === true && !committed.has(p.playerId)
              : !!active && active.playerId === p.playerId
          }
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
        {isSalvo ? (
          <>
            {resolving && compact ? (
              <Resolving
                salvo={resolving}
                total={committed.size}
                name={name(resolving.shooterId)}
              />
            ) : (
              <SalvoCollect
                shooters={shooters}
                committed={committed}
                left={left}
                compact={compact}
              />
            )}
            {resolving && !compact && (
              <Resolving
                salvo={resolving}
                total={committed.size}
                name={name(resolving.shooterId)}
              />
            )}
          </>
        ) : active ? (
          <div className="turn dimmable">
            {compact ? (
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
            )}
          </div>
        ) : (
          <div className="turn dimmable" />
        )}
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
          <SoundButton />
          <span className="foot">
            Suivre la partie : {location.host}/board/{code}
          </span>
        </div>
      </aside>
      <FxLayer />
    </div>
  );
}
