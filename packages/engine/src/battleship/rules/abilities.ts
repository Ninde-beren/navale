import type {
  Ability,
  AbilityType,
  Coord,
  Echo,
  EchoThresholds,
  GameEvent,
  GameSettings,
  PendingShot,
  Ship,
} from '@navale/protocol';
import type { DecideContext } from '../../core/definition.js';
import {
  coordKey,
  inBounds,
  isSunk,
  playerById,
  sameCoord,
  type GameState,
  type Player,
} from '../state.js';
import type { ShotToResolve } from './resolve.js';

/*
 * Les capacités des commandants, décrites par `settings.commanders`. Chacune
 * remplace le tir de la manche. Chez un adversaire : le radar apprend, en privé,
 * quelles cases d'une zone portent un navire ; le sonar, une intensité d'écho ;
 * le missile tire sur une case et ses voisines. Sur sa propre flotte : la réparation
 * remet en état une case touchée, le bouclier protège une zone pour toute la partie,
 * le leurre pose un faux navire sur une case vide. Ce module calcule les zones et les
 * effets ; `decide` vérifie qui a le droit de jouer quoi.
 */

type Grid = Pick<GameSettings, 'grid'>;

/** Les capacités qui se jouent sur sa propre flotte ; les autres visent un adversaire. */
export const SELF_ABILITIES: ReadonlySet<AbilityType> = new Set(['repair', 'shield', 'decoy']);

/** Les cases d'une zone carrée de `size` de côté centrée sur `center`, dans la grille. */
export function radarZone(settings: Grid, center: Coord, size: number): Coord[] {
  const half = Math.floor(size / 2);
  const cells: Coord[] = [];
  for (let y = center.y - half; y <= center.y + half; y++)
    for (let x = center.x - half; x <= center.x + half; x++)
      if (inBounds(settings, { x, y })) cells.push({ x, y });
  return cells;
}

/** Un bouclier tel que l'état et les vues publiques le portent. */
type ShieldLike = { center: Coord; size: number; pierced: Coord[] };

/**
 * Ce bouclier protège-t-il encore cette case ? Oui dans sa zone, tant qu'aucun tir ne
 * l'a percée : chaque case arrête un tir. Un tir sur une case protégée est `BLOCKED`.
 */
export function shieldCovers(shield: ShieldLike | null | undefined, c: Coord): boolean {
  if (!shield) return false;
  const half = Math.floor(shield.size / 2);
  return (
    Math.abs(c.x - shield.center.x) <= half &&
    Math.abs(c.y - shield.center.y) <= half &&
    !shield.pierced.some((p) => sameCoord(p, c))
  );
}

/** Le bouclier après un tir bloqué sur `c` : la case est percée, elle ne protège plus rien. */
export function pierceShield<S extends ShieldLike>(shield: S | null, c: Coord): S | null {
  if (!shield || shield.pierced.some((p) => sameCoord(p, c))) return shield;
  return { ...shield, pierced: [...shield.pierced, c] };
}

/** Les cases frappées par un missile en croix : la case visée et ses quatre voisines, dans la grille. */
export function missileCells(settings: Grid, center: Coord): Coord[] {
  const around = [
    center,
    { x: center.x - 1, y: center.y },
    { x: center.x + 1, y: center.y },
    { x: center.x, y: center.y - 1 },
    { x: center.x, y: center.y + 1 },
  ];
  return around.filter((c) => inBounds(settings, c));
}

/**
 * Les cases qu'une rafale de missile frappe vraiment : la croix, sans les cases déjà
 * révélées. Celles qu'un bouclier protège sont frappées comme les autres, et bloquées.
 */
export function missileStrikes(
  settings: Grid,
  center: Coord,
  revealed: ReadonlyArray<{ coord: Coord }>,
): Coord[] {
  return missileCells(settings, center).filter((c) => !revealed.some((r) => sameCoord(r.coord, c)));
}

/**
 * Écart entre deux départs de missile d'une rafale : ils partent l'un après l'autre,
 * volent ensemble, puis les impacts s'enchaînent ; une seule annonce suit. Dérivé de
 * `settings.revealDelayMs`, assez court pour que tous partent avant le premier impact.
 */
export function burstStaggerMs(revealDelayMs: number): number {
  return Math.round(revealDelayMs * 0.06);
}

/** Les cases touchées d'une flotte qu'une réparation peut remettre en état : sur un bateau non coulé. */
export function repairableCells(fleet: Ship[]): Coord[] {
  return fleet.filter((ship) => !isSunk(ship)).flatMap((ship) => ship.hits);
}

/** Les cases de sa grille où l'on peut poser un leurre : ni navire, ni case révélée, ni leurre déjà posé. */
export function decoyCells(
  settings: Grid,
  fleet: Ship[],
  revealed: ReadonlyArray<{ coord: Coord }>,
  decoys: Coord[],
): Coord[] {
  const taken = new Set([
    ...fleet.flatMap((ship) => ship.cells.map(coordKey)),
    ...revealed.map((r) => coordKey(r.coord)),
    ...decoys.map(coordKey),
  ]);
  const out: Coord[] = [];
  for (let y = 0; y < settings.grid.height; y++)
    for (let x = 0; x < settings.grid.width; x++)
      if (!taken.has(coordKey({ x, y }))) out.push({ x, y });
  return out;
}

/**
 * L'écho d'un sonar qui compte `shipCells` cases de navire dans sa zone : faible, moyen
 * ou fort selon les seuils du commandant, avec la fourchette qu'il couvre. C'est tout ce
 * que son auteur apprend : un écho faible ne lui garantit jamais une zone vide.
 */
export function echoOf(shipCells: number, { medium, strong }: EchoThresholds): Echo {
  if (shipCells >= strong) return { level: 'strong', min: strong, max: null };
  if (shipCells >= medium) return { level: 'medium', min: medium, max: strong - 1 };
  return { level: 'weak', min: 0, max: medium - 1 };
}

/** Les cases de la liste qu'un détecteur voit comme un navire chez ce joueur : ses navires, et ses leurres. */
function contactsAmong(player: Player | undefined, cells: Coord[]): Coord[] {
  if (!player) return [];
  const hull = new Set([
    ...player.fleet.flatMap((ship) => ship.cells.map(coordKey)),
    ...player.decoys.map(coordKey),
  ]);
  return cells.filter((c) => hull.has(coordKey(c)));
}

export interface AbilityEffects {
  /** À journaliser avant la résolution des tirs : l'usage, et son effet immédiat. */
  events: GameEvent[];
  /** Les tirs que la capacité ajoute à la manche (missile). */
  shots: ShotToResolve[];
}

/**
 * Les effets d'une capacité engagée, contre l'état courant. Le radar et le sonar
 * lisent la flotte de la cible (leurres compris : ils trompent aussi les détecteurs) :
 * c'est le seul endroit, hors résolution des tirs, où le moteur regarde une flotte
 * adverse, et leur résultat reste privé (`RADAR_RESULT`).
 */
export function abilityEffects(
  state: GameState,
  ability: Ability,
  playerId: string,
  pending: PendingShot,
  _ctx: DecideContext,
): AbilityEffects {
  const round = state.round?.index ?? 0;
  const used: GameEvent = {
    type: 'ABILITY_USED',
    round,
    playerId,
    ability: ability.type,
    targetId: pending.targetId,
    coord: pending.coord,
  };
  switch (ability.type) {
    case 'radar':
    case 'sonar': {
      const cells = radarZone(state.settings, pending.coord, ability.size);
      const contacts = contactsAmong(playerById(state, pending.targetId), cells);
      // Le radar dit où ; le sonar, seulement une intensité d'écho (le total exact sans seuils).
      const found =
        ability.type === 'radar'
          ? { contacts, shipCells: contacts.length }
          : ability.echo
            ? { echo: echoOf(contacts.length, ability.echo) }
            : { shipCells: contacts.length };
      return {
        events: [
          used,
          {
            type: 'RADAR_RESULT',
            round,
            playerId,
            targetId: pending.targetId,
            center: pending.coord,
            size: ability.size,
            ...found,
            ability: ability.type,
          },
        ],
        shots: [],
      };
    }
    case 'repair':
      return {
        events: [used, { type: 'SHIP_REPAIRED', round, playerId, coord: pending.coord }],
        shots: [],
      };
    case 'shield':
      return {
        events: [
          used,
          {
            type: 'SHIELD_RAISED',
            round,
            playerId,
            center: pending.coord,
            size: ability.size,
          },
        ],
        shots: [],
      };
    case 'decoy':
      return {
        events: [used, { type: 'DECOY_PLACED', round, playerId, coord: pending.coord }],
        shots: [],
      };
    case 'missile': {
      const target = playerById(state, pending.targetId);
      const cells = missileStrikes(state.settings, pending.coord, target?.shotsReceived ?? []);
      const burst = { center: pending.coord, size: cells.length };
      const shots = cells.map((coord) => ({
        shooterId: playerId,
        targetId: pending.targetId,
        coord,
        burst,
      }));
      return { events: [used], shots };
    }
  }
}
