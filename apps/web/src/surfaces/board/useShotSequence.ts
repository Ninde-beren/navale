import { useEffect, useRef, useState } from 'react';
import { burstStaggerMs } from '@navale/engine';
import {
  coordLabel,
  type Commander,
  type Coord,
  type PublicPlayer,
  type ResolvedShot,
  type VisibleEnvelope,
} from '@navale/protocol';
import { play, playSunkJingle } from '../../shared/audio.js';
import { burstResult, sameBurst } from '../../shared/bursts.js';
import { ABILITY_LABELS, RESULT_LABELS } from '../../shared/labels.js';
import { ShotFx, sleep, type Sweep } from './shotFx.js';

/** Une case révélée par l'animation, en attendant l'instantané qui la confirmera. */
export type Reveal = { coord: Coord; result: 'MISS' | 'HIT' };
/** L'annonce au centre de l'écran : « TOUCHÉ », « D7 · Julie → Marc ». */
export type Callout = { word: string; where: string; cls: string };
/** Salve en cours de résolution : la manche, le numéro du tir, son tireur. */
export type SalvoStep = { round: number; step: number; shooterId: string };

const SOUND = { MISS: 'miss', HIT: 'hit', SUNK: 'sunk', BLOCKED: 'blocked' } as const;
/** Le petit air du tireur part juste après l'explosion du coulé. */
const JINGLE_DELAY_MS = 550;
const ELIMINATED_CALLOUT_MS = 1600;

/**
 * La séquence animée de l'écran central. Chaque SHOT_RESOLVED reçu rejoint la file
 * de ShotFx (départ, vol, impact, annonce), dans l'ordre ; les éliminations
 * s'annoncent après les tirs. Les cases touchées sont révélées à l'impact, puis
 * l'instantané suivant (`seq`) prend le relais.
 */
export function useShotSequence({
  events,
  players,
  commanders,
  revealDelayMs,
  seq,
}: {
  events: VisibleEnvelope[];
  players: PublicPlayer[];
  /** Les commandants de la partie : la taille de la zone d'un radar en dépend. */
  commanders: Commander[];
  revealDelayMs: number;
  seq: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<ShotFx | null>(null);
  // Les rappels de ShotFx vivent plus longtemps qu'un rendu : ils lisent les joueurs à jour ici.
  const playersRef = useRef(players);
  playersRef.current = players;
  const lastSeq = useRef(0);
  // Rafale en cours de réception : ses tirs, jusqu'au dernier, puis une seule annonce.
  const burst = useRef<ResolvedShot[]>([]);
  // Dernier tir parti : un tir de la même rafale ne compte pas comme un tir de plus de la salve.
  const lastLaunch = useRef<ResolvedShot | null>(null);
  const [reveals, setReveals] = useState<Record<string, Reveal[]>>({});
  const [fresh, setFresh] = useState<{ targetId: string; coord: Coord } | null>(null);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [salvoStep, setSalvoStep] = useState<SalvoStep | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);

  const playerOf = (playerId: string) => playersRef.current.find((p) => p.playerId === playerId);
  const nameOf = (playerId: string) => playerOf(playerId)?.name ?? '?';

  useEffect(() => {
    setReveals({});
    setFresh(null);
  }, [seq]);

  useEffect(() => {
    const fx = new ShotFx(
      () => rootRef.current?.closest<HTMLElement>('.screen') ?? rootRef.current,
      {
        onLaunch: (shot) => {
          play('launch');
          const continues = sameBurst(lastLaunch.current ?? undefined, shot);
          lastLaunch.current = shot;
          if (continues) return;
          setSalvoStep((current) => ({
            round: shot.round,
            step: current?.round === shot.round ? current.step + 1 : 1,
            shooterId: shot.shooterId,
          }));
        },
        onImpact: (shot) => {
          play(SOUND[shot.result]);
          const shooter = playerOf(shot.shooterId);
          if (shot.result === 'SUNK' && shooter)
            setTimeout(() => playSunkJingle(shooter.color), JINGLE_DELAY_MS);
          // Un tir bloqué ne révèle rien : sa case garde son verre, fêlé à l'instantané suivant.
          if (shot.result === 'BLOCKED') return;
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
            shot && {
              word: RESULT_LABELS[shot.result],
              where: `${coordLabel(shot.coord)} · ${nameOf(shot.shooterId)} → ${nameOf(shot.targetId)}`,
              cls: shot.result.toLowerCase(),
            },
          ),
        onSweep: setSweep,
      },
    );
    fxRef.current = fx;
    return () => {
      fx.dispose();
      fxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;
    for (const { seq: eventSeq, event } of events) {
      if (eventSeq <= lastSeq.current) continue;
      lastSeq.current = eventSeq;
      if (event.type === 'SHOT_RESOLVED' && event.burst) {
        // Rafale de missile : tir, tir, tir, puis impact, impact, impact, et une seule annonce.
        // Les tirs arrivent ensemble ; la rafale part quand on les a tous.
        const { type: _type, ...shot } = event;
        if (!sameBurst(burst.current.at(-1), shot)) burst.current = [];
        burst.current.push(shot);
        if (burst.current.length >= event.burst.size) {
          const shots = burst.current;
          burst.current = [];
          void fx.playBurst(shots, revealDelayMs, burstStaggerMs(revealDelayMs));
          const result = burstResult(shots);
          const where = `Missile ${coordLabel(event.burst.center)} · ${nameOf(event.shooterId)} → ${nameOf(event.targetId)}`;
          void fx.enqueue(async () => {
            setCallout({ word: RESULT_LABELS[result], where, cls: result.toLowerCase() });
            await sleep(ShotFx.timings(revealDelayMs).hold);
            setCallout(null);
            fx.finish();
          });
        }
      } else if (event.type === 'SHOT_RESOLVED') {
        void fx.play(event, revealDelayMs);
      } else if (event.type === 'ABILITY_USED' && event.ability === 'missile') {
        // La rafale qui suit est l'annonce du missile.
      } else if (event.type === 'ABILITY_USED') {
        // Une capacité qui ne tire pas : son animation sur la case (rien n'y est révélé),
        // avec son son, puis l'annonce. Un leurre se pose en secret : l'annonce seule.
        const kind = event.ability;
        const word = ABILITY_LABELS[kind].toUpperCase();
        const actor = nameOf(event.playerId);
        const hold = ShotFx.timings(revealDelayMs).hold;
        if (kind === 'decoy' || !('coord' in event)) {
          void fx.enqueue(async () => {
            play('decoy');
            setCallout({ word, where: `${actor} pose un leurre, quelque part`, cls: 'ability' });
            await sleep(hold);
            setCallout(null);
          });
        } else {
          const own = kind === 'repair' || kind === 'shield';
          const who = own ? actor : `${actor} → ${nameOf(event.targetId)}`;
          const where = `${coordLabel(event.coord)} · ${who}`;
          const commanderId = playerOf(event.playerId)?.commanderId;
          const ability = commanders.find((c) => c.id === commanderId)?.ability;
          const span = ability && 'size' in ability ? ability.size : 1;
          const mark = kind === 'missile' ? 'radar' : kind;
          void fx.enqueue(async () => {
            play(kind === 'repair' ? 'hammer' : kind === 'missile' ? 'radar' : kind);
            await fx.mark(
              mark,
              event.playerId,
              own ? event.playerId : event.targetId,
              event.coord,
              span,
            );
            setCallout({ word, where, cls: 'ability' });
            await sleep(hold);
            setCallout(null);
          });
        }
      } else if (event.type === 'PLAYER_ELIMINATED') {
        const where = `${nameOf(event.playerId)} · ${event.rank}e`;
        void fx.enqueue(async () => {
          play('eliminated');
          setCallout({ word: 'ÉLIMINÉ', where, cls: 'sunk' });
          await sleep(ELIMINATED_CALLOUT_MS);
          setCallout(null);
        });
      }
    }
  }, [events]);

  return { rootRef, reveals, fresh, callout, salvoStep, sweep };
}
