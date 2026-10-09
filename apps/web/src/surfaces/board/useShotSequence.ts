import { useEffect, useRef, useState } from 'react';
import { coordLabel, type Coord, type PublicPlayer, type VisibleEnvelope } from '@navale/protocol';
import { play, playSunkJingle } from '../../shared/audio.js';
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
      if (event.type === 'SHOT_RESOLVED') {
        void fx.play(event, revealDelayMs);
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
