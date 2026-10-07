import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { rematchEvents } from '@navale/engine';
import type { EventEnvelope } from '@navale/protocol';
import type { PresenceTracker } from '../realtime/presence.js';
import type { GameRegistry } from '../store/registry.js';
import type { GameRuntime } from './game-runtime.js';
import type { Publisher, SocketData } from './publisher.js';

/**
 * Revanche (E1-S15, E6-S9) : sur REMATCH_CREATED, ouvre la nouvelle partie avec
 * le journal initial produit par le moteur, y transfère les jetons, puis fait
 * basculer chaque socket de l'ancienne partie vers la nouvelle avec un
 * instantané. Les clients n'ont rien à ressaisir : même code, mêmes jetons.
 */
export class RematchService {
  constructor(
    private readonly io: Server,
    private readonly registry: GameRegistry,
    private readonly publisher: Publisher,
    private readonly presence: PresenceTracker,
  ) {}

  onEvents(runtime: GameRuntime, envelopes: EventEnvelope[]): void {
    for (const env of envelopes)
      if (env.event.type === 'REMATCH_CREATED') this.open(runtime, env.event.newGameId);
  }

  private open(old: GameRuntime, newGameId: string): void {
    const now = Date.now();
    const events = rematchEvents(old.state, newGameId, {
      actor: { kind: 'system' },
      now,
      random: Math.random,
      newId: () => randomUUID(),
    });
    const next = this.registry.createFromEvents(newGameId, events, now);
    this.registry.moveTokens(old.gameId, newGameId);

    const room = this.io.sockets.adapter.rooms.get(`game:${old.gameId}`);
    const sockets = [...(room ?? [])]
      .map((id) => this.io.sockets.sockets.get(id))
      .filter((s) => s !== undefined);
    // 1. Tout le monde change de partie (rooms, présence)…
    for (const socket of sockets) {
      const data = socket.data as SocketData;
      data.gameId = newGameId;
      void socket.leave(`game:${old.gameId}`);
      void socket.join(`game:${newGameId}`);
      if (data.playerId) {
        this.presence.remove(old.gameId, data.playerId);
        this.presence.add(newGameId, data.playerId);
      }
    }
    // 2. …puis reçoit l'instantané de la nouvelle partie, présence complète.
    for (const socket of sockets) {
      socket.emit('rematch', { gameId: newGameId, code: next.code });
      this.publisher.sendSnapshot(socket, next);
    }
  }
}
