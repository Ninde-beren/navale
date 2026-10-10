import type { GameEvent } from '@navale/protocol';
import { normalizeSettings } from './settings.js';
import { playerById, sameCoord, type GameState, type Player } from './state.js';

/** Applique un événement à l'état. Pure, sans validation : l'événement est un fait accompli. */
export function evolve(state: GameState, event: GameEvent): GameState {
  return { ...apply(state, event), seq: state.seq + 1 };
}

function mapPlayer(state: GameState, playerId: string, f: (p: Player) => Player): GameState {
  return { ...state, players: state.players.map((p) => (p.playerId === playerId ? f(p) : p)) };
}

function apply(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_CREATED':
      return {
        ...state,
        gameId: event.gameId,
        code: event.code,
        settings: normalizeSettings(event.settings),
        createdAt: event.createdAt,
      };
    case 'PLAYER_JOINED': {
      const player: Player = {
        playerId: event.playerId,
        kind: event.kind,
        ...(event.level ? { level: event.level } : {}),
        substitute: null,
        commanderId: null,
        abilityUsesLeft: 0,
        radarResults: [],
        shield: null,
        decoys: [],
        name: event.name,
        color: event.color,
        seat: event.seat,
        status: 'PLACING',
        fleet: [],
        shotsReceived: [],
        eliminatedAtRound: null,
        rank: null,
      };
      return { ...state, players: [...state.players, player].sort((a, b) => a.seat - b.seat) };
    }
    case 'PLAYER_LEFT':
    case 'PLAYER_KICKED':
      return { ...state, players: state.players.filter((p) => p.playerId !== event.playerId) };
    case 'PLAYER_PROFILE_UPDATED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        name: event.name,
        color: event.color,
      }));
    case 'FLEET_PLACED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        fleet: event.ships.map((s) => ({ ...s, cells: [...s.cells], hits: [...s.hits] })),
      }));
    case 'PLAYER_READY_CHANGED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        status: event.ready ? 'READY' : 'PLACING',
      }));
    case 'COMMANDER_CHOSEN': {
      const commander = state.settings.commanders.find((c) => c.id === event.commanderId);
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        commanderId: event.commanderId,
        abilityUsesLeft: commander?.uses ?? 0,
      }));
    }
    case 'ABILITY_USED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        abilityUsesLeft: Math.max(0, p.abilityUsesLeft - 1),
      }));
    case 'RADAR_RESULT': {
      const { type: _type, playerId, ...result } = event;
      return mapPlayer(state, playerId, (p) => ({
        ...p,
        radarResults: [...p.radarResults, result],
      }));
    }
    case 'SHIELD_RAISED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        shield: { center: event.center, size: event.size, turnsLeft: event.turns },
      }));
    case 'DECOY_PLACED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        decoys: [...p.decoys, event.coord],
      }));
    case 'SHIP_REPAIRED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        fleet: p.fleet.map((ship) => ({
          ...ship,
          hits: ship.hits.filter((h) => !sameCoord(h, event.coord)),
        })),
        shotsReceived: p.shotsReceived.filter((s) => !sameCoord(s.coord, event.coord)),
      }));
    case 'GAME_STARTED':
      return {
        ...state,
        status: 'PLAYING',
        settings: normalizeSettings(event.settings),
        startedAt: event.startedAt,
        lastShooterSeat: null,
        round: null,
        players: state.players.map((p) => ({ ...p, status: 'ALIVE' })),
      };
    case 'ROUND_STARTED':
      return {
        ...state,
        // Un bouclier s'use au début de chaque tour de son propriétaire, et tombe au dernier.
        players: state.players.map((p) =>
          p.shield && event.expectedShooters.includes(p.playerId)
            ? {
                ...p,
                shield:
                  p.shield.turnsLeft > 1
                    ? { ...p.shield, turnsLeft: p.shield.turnsLeft - 1 }
                    : null,
              }
            : p,
        ),
        round: {
          index: event.round,
          expectedShooters: [...event.expectedShooters],
          committed: {},
          startedAt: event.startedAt,
          deadline: event.deadline,
        },
      };
    case 'SHOT_COMMITTED':
      if (!state.round) return state;
      return {
        ...state,
        round: {
          ...state.round,
          committed: {
            ...state.round.committed,
            [event.shooterId]: {
              targetId: event.targetId,
              coord: event.coord,
              ...(event.ability ? { ability: event.ability } : {}),
            },
          },
        },
      };
    case 'SHOT_RESOLVED': {
      const { type: _type, ...shot } = event;
      const withLog = { ...state, shotsLog: [...state.shotsLog, shot] };
      // Arrêté par un bouclier : rien n'est touché ni révélé.
      if (event.result === 'BLOCKED') return withLog;
      return mapPlayer(withLog, event.targetId, (p) => {
        const revealed = p.shotsReceived.some((s) => sameCoord(s.coord, event.coord))
          ? p.shotsReceived
          : [
              ...p.shotsReceived,
              { coord: event.coord, result: event.result === 'MISS' ? 'MISS' : 'HIT' } as const,
            ];
        const fleet =
          event.result === 'MISS'
            ? p.fleet
            : p.fleet.map((ship) =>
                ship.cells.some((c) => sameCoord(c, event.coord)) &&
                !ship.hits.some((h) => sameCoord(h, event.coord))
                  ? { ...ship, hits: [...ship.hits, event.coord] }
                  : ship,
              );
        return { ...p, shotsReceived: revealed, fleet };
      });
    }
    case 'PLAYER_SUBSTITUTED':
      return mapPlayer(state, event.playerId, (p) => ({ ...p, substitute: event.level }));
    case 'PLAYER_RESUMED':
      return mapPlayer(state, event.playerId, (p) => ({ ...p, substitute: null }));
    case 'PLAYER_ELIMINATED':
      return mapPlayer(state, event.playerId, (p) => ({
        ...p,
        status: 'ELIMINATED',
        rank: event.rank,
        eliminatedAtRound: event.round,
      }));
    case 'ROUND_RESOLVED': {
      const expected = state.round?.expectedShooters[0];
      const seat =
        state.settings.variant === 'sequential' && expected !== undefined
          ? (playerById(state, expected)?.seat ?? state.lastShooterSeat)
          : state.lastShooterSeat;
      return { ...state, round: null, lastShooterSeat: seat };
    }
    case 'GAME_FINISHED':
      return { ...state, status: 'FINISHED', ranking: event.ranking, finishedAt: event.finishedAt };
    case 'GAME_CANCELLED':
      return { ...state, status: 'CANCELLED', round: null };
    case 'REMATCH_CREATED':
      return { ...state, rematchGameId: event.newGameId };
  }
}
