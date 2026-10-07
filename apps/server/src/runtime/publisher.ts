import type { Server, Socket } from 'socket.io';
import { battleship } from '@navale/engine';
import type { BoardView, EventEnvelope, GameEvent, PlayerView } from '@navale/protocol';
import type { PresenceTracker } from '../realtime/presence.js';
import type { GameRuntime } from './game-runtime.js';

export interface SocketData {
  gameId: string;
  playerId: string | null;
  isHost: boolean;
}

/** Vue publique d'un événement : ce que reçoivent l'écran central et les autres joueurs. */
export function publicEvent(event: GameEvent): GameEvent {
  switch (event.type) {
    case 'FLEET_PLACED':
      return { ...event, ships: [] };
    case 'ROUND_STARTED':
      return { ...event, legalTargets: {} };
    case 'SHOT_COMMITTED':
      return { ...event, targetId: '', coord: { x: -1, y: -1 } };
    default:
      return event;
  }
}

/** Vues privées d'un événement : par joueur destinataire. */
export function privateEvents(event: GameEvent): Array<[string, GameEvent]> {
  switch (event.type) {
    case 'FLEET_PLACED':
      return [[event.playerId, event]];
    case 'ROUND_STARTED':
      return Object.keys(event.legalTargets).map((id) => [
        id,
        { ...event, legalTargets: { [id]: event.legalTargets[id] ?? [] } },
      ]);
    case 'SHOT_COMMITTED':
      return [[event.shooterId, event]];
    default:
      return [];
  }
}

/**
 * Publie les événements aux bonnes rooms, en respectant la cadence (ADR-006) :
 * tout ce qui suit un SHOT_RESOLVED est retardé de `revealDelayMs`, puis un
 * instantané à jour part vers chaque socket de la partie.
 */
export class Publisher {
  private readonly releaseAt = new Map<string, number>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly io: Server,
    private readonly presence: PresenceTracker,
  ) {}

  publish(runtime: GameRuntime, envelopes: EventEnvelope[]): void {
    const gameId = runtime.gameId;
    const now = Date.now();
    let t = Math.max(now, this.releaseAt.get(gameId) ?? 0);
    for (const env of envelopes) {
      this.schedule(t - now, () => this.emitEvent(gameId, env));
      if (env.event.type === 'SHOT_RESOLVED') t += runtime.state.settings.revealDelayMs;
    }
    this.releaseAt.set(gameId, t);
    this.schedule(t - now, () => this.sendSnapshots(runtime));
  }

  private schedule(delay: number, fn: () => void): void {
    if (delay <= 0) {
      fn();
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delay);
    this.timers.add(timer);
  }

  private emitEvent(gameId: string, env: EventEnvelope): void {
    const privates = privateEvents(env.event);
    const privateRooms = privates.map(([id]) => `player:${id}`);
    this.io
      .to(`game:${gameId}`)
      .except(privateRooms)
      .emit('event', { ...env, event: publicEvent(env.event) });
    for (const [id, event] of privates) this.io.to(`player:${id}`).emit('event', { ...env, event });
  }

  viewFor(socket: Socket, runtime: GameRuntime): BoardView | PlayerView {
    const data = socket.data as SocketData;
    const presence = this.presence.of(runtime.gameId);
    const me = data.playerId
      ? runtime.state.players.find((p) => p.playerId === data.playerId)
      : undefined;
    const view = me
      ? battleship.projectPrivate(runtime.state, me.playerId, presence)
      : battleship.projectPublic(runtime.state, presence);
    return { ...view, isHost: data.isHost };
  }

  sendSnapshot(socket: Socket, runtime: GameRuntime): void {
    socket.emit('snapshot', this.viewFor(socket, runtime));
  }

  sendSnapshots(runtime: GameRuntime): void {
    const room = this.io.sockets.adapter.rooms.get(`game:${runtime.gameId}`);
    if (!room) return;
    for (const id of room) {
      const socket = this.io.sockets.sockets.get(id);
      if (socket) this.sendSnapshot(socket, runtime);
    }
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
