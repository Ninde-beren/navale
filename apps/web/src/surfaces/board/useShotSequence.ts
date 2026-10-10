import { useEffect, useRef, useState } from 'react';
import { burstStepMs } from '@navale/engine';
import {
  coordLabel,
  type Coord,
  type PublicPlayer,
  type ResolvedShot,
  type VisibleEnvelope,
} from '@navale/protocol';
import { play, playSunkJingle } from '../../shared/audio.js';
import { burstResult, sameBurst } from '../../shared/bursts.js';
import { ABILITY_LABELS, RESULT_LABELS } from '../../shared/labels.js';
import { ShotFx, sleep } from './shotFx.js';

/** Une case révélée par l'animation, en attendant l'instantané qui la confirmera. */
export type Reveal = { coord: Coord; result: 'MISS' | 'HIT' };
/** L'annonce au centre de l'écran : « TOUCHÉ », « D7 · Julie → Marc ». */
export type Callout = { word: string; where: string; cls: string };
/** Salve en cours de résolution : la manche, le numéro du tir, son tireur. */
export type SalvoStep = { round: number; step: number; shooterId: string };

const SOUND = { MISS: 'miss', HIT: 'hit', SUNK: 'sunk' } as const;
/** Le petit air du tireur part juste après l'explosion du coulé. */
const JINGLE_DELAY_MS = 550;
const ELIMINATED_CALLOUT_MS = 1600;
const ABILITY_CALLOUT_MS = 1800;

/**
 * La séquence animée de l'écran central. Chaque SHOT_RESOLVED reçu rejoint la file
 * de ShotFx (départ, vol, impact, annonce), dans l'ordre ; les éliminations
 * s'annoncent après les tirs. Les cases touchées sont révélées à l'impact, puis
 * l'instantané suivant (`seq`) prend le relais.
 */
export function useShotSequence({
  events,
  players,
  revealDelayMs,
  seq,
}: {
  events: VisibleEnvelope[];
  players: PublicPlayer[];
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
        // Rafale de missile : paf paf paf, puis une seule annonce avec son verdict.
        const { type: _type, ...shot } = event;
        if (!sameBurst(burst.current.at(-1), shot)) burst.current = [];
        burst.current.push(shot);
        void fx.playQuick(shot, burstStepMs(revealDelayMs));
        if (burst.current.length >= event.burst.size) {
          const shots = burst.current;
          burst.current = [];
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
        // La capacité s'annonce avant ses effets (radar, réparation, tirs du missile).
        const who =
          event.ability === 'repair'
            ? nameOf(event.playerId)
            : `${nameOf(event.playerId)} → ${nameOf(event.targetId)}`;
        const where = `${coordLabel(event.coord)} · ${who}`;
        const word = ABILITY_LABELS[event.ability].toUpperCase();
        void fx.enqueue(async () => {
          setCallout({ word, where, cls: 'ability' });
          await sleep(ABILITY_CALLOUT_MS);
          setCallout(null);
        });
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

  return { rootRef, reveals, fresh, callout, salvoStep };
}
