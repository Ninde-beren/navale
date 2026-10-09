import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { sameCoord } from '@navale/engine';
import type { Coord, Ship } from '@navale/protocol';
import { ownGridClasses, publicGridClasses } from '../../shared/cells.js';
import { Grid } from '../../shared/ui/Grid.js';
import { useMedia } from '../../shared/useMedia.js';

/*
 * Illustration de l'accueil : une partie fictive à trois, vue du dessus et rejouée en
 * boucle avec les vraies grilles du jeu. La tablette est posée au milieu de la table,
 * les téléphones de Julie et Marc sont devant eux, celui d'Inès est en main au premier
 * plan. C'est un décor, rien ne passe par le serveur.
 */

const SIZE = 8;
const PLAYERS = [
  { name: 'Julie', color: 'red' },
  { name: 'Marc', color: 'blue' },
  { name: 'Inès', color: 'green' },
] as const;
const ME = 2;
const STEP_MS = 1800;
const HOLD_MS = 3200;

function ship(shipId: string, x: number, y: number, size: number, orientation: 'H' | 'V'): Ship {
  const cells = Array.from({ length: size }, (_, i) =>
    orientation === 'H' ? { x: x + i, y } : { x, y: y + i },
  );
  return { shipId, type: shipId, size, bow: { x, y }, orientation, cells, hits: [] };
}

const FLEETS: Ship[][] = [
  [ship('j1', 1, 2, 4, 'H'), ship('j2', 4, 4, 3, 'V'), ship('j3', 6, 0, 2, 'V')],
  [ship('m1', 3, 3, 3, 'V'), ship('m2', 0, 6, 4, 'H'), ship('m3', 5, 1, 2, 'H')],
  [
    ship('i1', 1, 1, 4, 'H'),
    ship('i2', 6, 3, 3, 'V'),
    ship('i3', 1, 5, 2, 'H'),
    ship('i4', 3, 7, 3, 'H'),
  ],
];

/**
 * Un tir tel que le serveur l'annoncerait : le résultat est écrit dans le scénario,
 * jamais déduit des flottes, même pour un décor.
 */
interface Shot {
  by: number;
  target: number;
  at: Coord;
  result: 'MISS' | 'HIT' | 'SUNK';
}
/** Tirs déjà joués quand la scène commence. */
const OPENING: Shot[] = [
  { by: 1, target: 0, at: { x: 2, y: 2 }, result: 'HIT' },
  { by: 2, target: 0, at: { x: 5, y: 5 }, result: 'MISS' },
  { by: 1, target: 0, at: { x: 0, y: 6 }, result: 'MISS' },
  { by: 2, target: 0, at: { x: 6, y: 0 }, result: 'HIT' },
  { by: 1, target: 0, at: { x: 6, y: 1 }, result: 'SUNK' },
  { by: 0, target: 1, at: { x: 3, y: 3 }, result: 'HIT' },
  { by: 2, target: 1, at: { x: 3, y: 4 }, result: 'HIT' },
  { by: 0, target: 1, at: { x: 1, y: 1 }, result: 'MISS' },
  { by: 2, target: 1, at: { x: 6, y: 5 }, result: 'MISS' },
  { by: 0, target: 1, at: { x: 2, y: 6 }, result: 'HIT' },
  { by: 0, target: 2, at: { x: 2, y: 1 }, result: 'HIT' },
  { by: 1, target: 2, at: { x: 5, y: 3 }, result: 'MISS' },
  { by: 0, target: 2, at: { x: 0, y: 7 }, result: 'MISS' },
  { by: 1, target: 2, at: { x: 1, y: 5 }, result: 'HIT' },
];
/** Tirs rejoués en boucle, chacun son tour. */
const LOOP: Shot[] = [
  { by: 0, target: 1, at: { x: 3, y: 5 }, result: 'SUNK' },
  { by: 1, target: 2, at: { x: 3, y: 1 }, result: 'HIT' },
  { by: 2, target: 0, at: { x: 3, y: 2 }, result: 'HIT' },
  { by: 0, target: 2, at: { x: 4, y: 4 }, result: 'MISS' },
  { by: 1, target: 0, at: { x: 4, y: 5 }, result: 'HIT' },
  { by: 2, target: 1, at: { x: 6, y: 1 }, result: 'HIT' },
];
const CALLOUTS = {
  MISS: { word: 'Raté', cls: 'miss' },
  HIT: { word: 'Touché', cls: 'hit' },
  SUNK: { word: 'Coulé', cls: 'sunk' },
} as const;

/** Grilles après `step` tirs de la boucle : publiques pour l'écran, privée pour le téléphone. */
function sceneAt(step: number) {
  const shots = [...OPENING, ...LOOP.slice(0, step)];
  const players = FLEETS.map((fleet, p) => {
    const received = shots.filter((s) => s.target === p);
    const touched = received.filter((s) => s.result !== 'MISS').map((s) => s.at);
    const revealed = received.map((s) => ({
      coord: s.at,
      result: s.result === 'MISS' ? ('MISS' as const) : ('HIT' as const),
    }));
    const ships = fleet.map((s) => ({
      ...s,
      hits: s.cells.filter((c) => touched.some((t) => sameCoord(t, c))),
    }));
    const sunk = received
      .filter((s) => s.result === 'SUNK')
      .flatMap((s) => fleet.filter((f) => f.cells.some((c) => sameCoord(c, s.at))));
    return { ships, revealed, sunk };
  });
  const last = step > 0 ? LOOP[step - 1]! : null;
  return { players, last, next: LOOP[step % LOOP.length]!.by };
}

/** `still` fige la scène après ce nombre de tirs, annonce comprise (image de partage). */
export function TableScene({ still }: { still?: number }) {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [step, setStep] = useState(0);
  const frozen = still !== undefined || reduced;

  useEffect(() => {
    if (frozen) return;
    const done = step === LOOP.length;
    const t = setTimeout(() => setStep(done ? 0 : step + 1), done ? HOLD_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [step, frozen]);

  const shown = still ?? (reduced ? LOOP.length : step);
  // Mouvement réduit : l'état final, sans case qui brille ni annonce.
  const fx = still !== undefined || !reduced;
  const { players, last, next } = sceneAt(shown);
  const phone = (p: number, place: string) => {
    const player = PLAYERS[p]!;
    const mine = next === p;
    return (
      <div className={`home-phone ${place} me-${player.color} c-${player.color}`}>
        <span className="home-phone-who">{player.name}</span>
        <span className="home-phone-label">Ta flotte</span>
        <Grid
          width={SIZE}
          height={SIZE}
          cellClass={ownGridClasses(players[p]!.ships, players[p]!.revealed)}
        />
        <span className={clsx('home-phone-action', mine && 'mine')}>
          {mine ? 'À toi de tirer' : `Au tour de ${PLAYERS[next]!.name}`}
        </span>
      </div>
    );
  };
  const shooter = PLAYERS[next]!;

  return (
    <div
      className="home-scene"
      role="img"
      aria-label="Une partie à trois vue du dessus : la tablette au milieu de la table avec les grilles de Julie, Marc et Inès, et le téléphone de chaque joueur devant lui."
    >
      <div className="home-scene-stage" aria-hidden="true">
        <div className="home-table">
          <div className="home-tablet">
            <div className="home-tablet-bar">
              <span className="code">KRTX</span>
              <span className={`turn c-${shooter.color}`}>
                Au tour de <b>{shooter.name}</b>
              </span>
            </div>
            <div className="home-tablet-zones">
              {PLAYERS.map((p, i) => (
                <div
                  key={p.name}
                  className={clsx('home-zone', `c-${p.color}`, i === next && 'active')}
                >
                  <span className="home-zone-name">{p.name}</span>
                  <Grid
                    width={SIZE}
                    height={SIZE}
                    cellClass={publicGridClasses(
                      players[i]!.revealed,
                      players[i]!.sunk,
                      fx && last?.target === i ? last.at : null,
                    )}
                  />
                  {fx && last?.target === i && (
                    <span
                      key={shown}
                      className={clsx(
                        'home-scene-callout',
                        CALLOUTS[last.result].cls,
                        still !== undefined && 'still',
                      )}
                    >
                      {CALLOUTS[last.result].word}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {phone(0, 'seat-left')}
          {phone(1, 'seat-top')}
        </div>
        {phone(ME, 'held')}
      </div>
    </div>
  );
}
