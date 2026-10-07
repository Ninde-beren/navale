import type { Server, Socket } from 'socket.io';
import type { Actor } from '@navale/engine';
import { CommandSchema, type Ack, type Command } from '@navale/protocol';
import type { Publisher, SocketData } from '../runtime/publisher.js';
import type { GameRegistry } from '../store/registry.js';
import { AuthError, resolveAuth } from './auth.js';
import type { PresenceTracker } from './presence.js';

const HOST_ONLY = new Set<Command['type']>([
  'START_GAME',
  'KICK_PLAYER',
  'ADD_BOT',
  'REMOVE_BOT',
  'FORCE_ROUND',
  'CANCEL_GAME',
  'REMATCH',
]);

type AckFn = (ack: Ack) => void;

export function registerSockets(
  io: Server,
  registry: GameRegistry,
  publisher: Publisher,
  presence: PresenceTracker,
): void {
  io.on('connection', (socket: Socket) => {
    let resolved: ReturnType<typeof resolveAuth>;
    try {
      resolved = resolveAuth(socket.handshake.auth, registry);
    } catch (err) {
      const code = err instanceof AuthError ? err.code : 'BAD_REQUEST';
      socket.emit('rejected', {
        code,
        message: err instanceof Error ? err.message : 'Connexion refusée.',
      });
      socket.disconnect(true);
      return;
    }
    const { runtime } = resolved;
    const data: SocketData = resolved.data;
    socket.data = data;
    void socket.join(`game:${data.gameId}`);
    if (data.playerId) {
      void socket.join(`player:${data.playerId}`);
      presence.add(data.gameId, data.playerId);
    }
    publisher.sendSnapshot(socket, runtime);

    socket.on('command', (raw: unknown, ack?: AckFn) => {
      void handleCommand(socket, raw, typeof ack === 'function' ? ack : () => undefined);
    });

    socket.on('disconnect', () => {
      const d = socket.data as SocketData;
      if (d.playerId) presence.remove(d.gameId, d.playerId);
    });
  });

  async function handleCommand(socket: Socket, raw: unknown, ack: AckFn): Promise<void> {
    const data = socket.data as SocketData;
    const runtime = registry.get(data.gameId);
    if (!runtime)
      return ack({ ok: false, error: { code: 'CODE_UNKNOWN', message: 'Partie introuvable.' } });
    const parsed = CommandSchema.safeParse(raw);
    if (!parsed.success) {
      return ack({
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Commande malformée.',
          details: parsed.error.issues,
        },
      });
    }
    const command = parsed.data;

    if (command.type === 'REQUEST_SNAPSHOT') {
      publisher.sendSnapshot(socket, runtime);
      return ack({ ok: true });
    }

    let actor: Actor;
    if (command.type === 'JOIN_GAME') {
      if (data.playerId)
        return ack({
          ok: false,
          error: { code: 'WRONG_STATE', message: 'Tu es déjà dans la partie.' },
        });
      actor = { kind: 'join' };
    } else if (HOST_ONLY.has(command.type)) {
      if (!data.isHost)
        return ack({
          ok: false,
          error: { code: 'NOT_HOST', message: 'Réservé à l’hôte de la partie.' },
        });
      actor = { kind: 'host' };
    } else {
      if (!data.playerId)
        return ack({
          ok: false,
          error: { code: 'WRONG_STATE', message: 'Cette commande vient d’un joueur.' },
        });
      actor = { kind: 'player', playerId: data.playerId };
    }

    const decision = await runtime.handle(actor, command);
    if (!decision.ok) return ack({ ok: false, error: decision.rejection });

    if (command.type === 'JOIN_GAME') {
      const joined = decision.events.find((e) => e.type === 'PLAYER_JOINED');
      if (joined?.type === 'PLAYER_JOINED') {
        const playerToken = registry.issueToken(data.gameId, 'player', joined.playerId);
        data.playerId = joined.playerId;
        void socket.join(`player:${joined.playerId}`);
        presence.add(data.gameId, joined.playerId);
        ack({ ok: true, data: { playerId: joined.playerId, playerToken } });
        publisher.sendSnapshot(socket, runtime);
        return;
      }
    }
    if (command.type === 'LEAVE_GAME' && data.playerId) {
      unbindPlayer(socket, data.playerId);
    }
    if ((command.type === 'KICK_PLAYER' || command.type === 'REMOVE_BOT') && decision.ok) {
      const removed = decision.events.find(
        (e) => e.type === 'PLAYER_KICKED' || e.type === 'PLAYER_LEFT',
      );
      if (removed && 'playerId' in removed) {
        registry.revokePlayer(data.gameId, removed.playerId);
        for (const s of await io.in(`player:${removed.playerId}`).fetchSockets()) {
          s.emit('removed', { reason: 'kicked' });
          s.disconnect(true);
        }
      }
    }
    ack({ ok: true });
  }

  function unbindPlayer(socket: Socket, playerId: string): void {
    const data = socket.data as SocketData;
    registry.revokePlayer(data.gameId, playerId);
    presence.remove(data.gameId, playerId);
    void socket.leave(`player:${playerId}`);
    data.playerId = null;
  }
}
