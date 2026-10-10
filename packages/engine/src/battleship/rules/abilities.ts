import type { Ability, Coord, GameEvent, GameSettings, PendingShot, Ship } from '@navale/protocol';
import type { DecideContext } from '../../core/definition.js';
import { coordKey, inBounds, isSunk, playerById, sameCoord, type GameState } from '../state.js';
import type { ShotToResolve } from './resolve.js';

/*
 * Les capacités des commandants, décrites par `settings.commanders`. Chacune
 * remplace le tir de la manche : le radar apprend, en privé, quelles cases d'une
 * zone portent un navire, sans tirer ; le missile tire sur une case et ses
 * voisines ; la réparation remet en état une case touchée. Ce module calcule les
 * zones et les effets ; `decide` vérifie qui a le droit de jouer quoi.
 */

/** Les cases d'une zone carrée de `size` de côté centrée sur `center`, dans la grille. */
export function radarZone(settings: GameSettings, center: Coord, size: number): Coord[] {
  const half = Math.floor(size / 2);
  const cells: Coord[] = [];
  for (let y = center.y - half; y <= center.y + half; y++)
    for (let x = center.x - half; x <= center.x + half; x++)
      if (inBounds(settings, { x, y })) cells.push({ x, y });
  return cells;
}

/** Les cases frappées par un missile en croix : la case visée et ses quatre voisines, dans la grille. */
export function missileCells(settings: GameSettings, center: Coord): Coord[] {
  const around = [
    center,
    { x: center.x - 1, y: center.y },
    { x: center.x + 1, y: center.y },
    { x: center.x, y: center.y - 1 },
    { x: center.x, y: center.y + 1 },
  ];
  return around.filter((c) => inBounds(settings, c));
}

/** Les cases qu'une rafale de missile frappe vraiment : la croix, sans les cases déjà révélées. */
export function missileStrikes(
  settings: GameSettings,
  center: Coord,
  revealed: ReadonlyArray<{ coord: Coord }>,
): Coord[] {
  return missileCells(settings, center).filter((c) => !revealed.some((r) => sameCoord(r.coord, c)));
}

/**
 * Cadence d'une rafale : les tirs partent à ce rythme, puis une seule annonce suit,
 * avec le délai d'annonce ordinaire. Dérivée de `settings.revealDelayMs`.
 */
export function burstStepMs(revealDelayMs: number): number {
  return Math.round(revealDelayMs / 4);
}

/** Les cases touchées d'une flotte qu'une réparation peut remettre en état : sur un bateau non coulé. */
export function repairableCells(fleet: Ship[]): Coord[] {
  return fleet.filter((ship) => !isSunk(ship)).flatMap((ship) => ship.hits);
}

/** Les cases de la liste qui portent un navire de cette flotte, dans l'ordre de la liste. */
function shipCellsAmong(fleet: Ship[], cells: Coord[]): Coord[] {
  const hull = new Set(fleet.flatMap((ship) => ship.cells.map(coordKey)));
  return cells.filter((c) => hull.has(coordKey(c)));
}

export interface AbilityEffects {
  /** À journaliser avant la résolution des tirs : l'usage, et son effet immédiat. */
  events: GameEvent[];
  /** Les tirs que la capacité ajoute à la manche (missile). */
  shots: ShotToResolve[];
}

/**
 * Les effets d'une capacité engagée, contre l'état courant. Le radar lit la flotte
 * de la cible : c'est le seul endroit, hors résolution des tirs, où le moteur
 * regarde une flotte adverse, et son résultat reste privé (`RADAR_RESULT`).
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
    case 'radar': {
      const target = playerById(state, pending.targetId);
      const cells = radarZone(state.settings, pending.coord, ability.size);
      const contacts = target ? shipCellsAmong(target.fleet, cells) : [];
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
            shipCells: contacts.length,
            contacts,
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
