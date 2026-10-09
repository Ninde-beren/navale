import { HOST_COMMANDS, type Actor } from '@navale/engine';
import {
  CommandSchema,
  type Ack,
  type Command,
  type GameEvent,
  type GameEventOf,
  type Joined,
} from '@navale/protocol';
import type { Publisher } from '../runtime/publisher.js';
import type { GameRegistry } from '../store/registry.js';
import { AuthError, resolveAuth } from './auth.js';
import type { PresenceTracker } from './presence.js';
import { gameRoom, playerRoom } from './rooms.js';
import type { GameServer, GameSocket, SocketData } from './types.js';

type AckFn = (ack: Ack) => void;

/**
 * Qui envoie la commande, d'après la connexion seulement : un client ne peut pas se
 * faire passer pour un autre joueur ou pour l'hôte en l'écrivant dans le message.
 * Le moteur refuse ensuite, avec son propre motif, ce que cet acteur n'a pas le droit de faire.
 */
function actorFor(command: Command, connection: SocketData): Actor {
  if (connection.isHost && HOST_COMMANDS.has(command.type)) return { kind: 'host' };
  if (connection.playerId) return { kind: 'player', playerId: connection.playerId };
  return { kind: 'join' };
}

function findEvent<T extends GameEvent['type']>(
  events: GameEvent[],
  type: T,
): GameEventOf<T> | undefined {
  return events.find((e): e is GameEventOf<T> => e.type === type);
}

export function registerSockets(
  io: GameServer,
  registry: GameRegistry,
  publisher: Publisher,
  presence: PresenceTracker,
): void {
  io.on('connection', (socket) => {
    let resolved: ReturnType<typeof resolveAuth>;
    try {
      resolved = resolveAuth(socket.handshake.auth, registry);
    } catch (err) {
      socket.emit('rejected', {
        code: err instanceof AuthError ? err.code : 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Connexion refusée.',
      });
      socket.disconnect(true);
      return;
    }
    const { runtime, data } = resolved;
    socket.data = data;
    void socket.join(gameRoom(data.gameId));
    if (data.playerId) bindPlayer(socket, data.playerId);
    publisher.sendSnapshot(socket, runtime);

    // Le type annonce une `Command`, mais rien ne garantit ce que le client envoie
    // réellement : la commande est validée par Zod, et l'accusé peut manquer.
    socket.on('command', (raw: unknown, ack?: AckFn) => {
      void handleCommand(socket, raw, typeof ack === 'function' ? ack : () => undefined);
    });

    socket.on('disconnect', () => {
      if (socket.data.playerId) presence.remove(socket.data.gameId, socket.data.playerId);
    });
  });

  async function handleCommand(socket: GameSocket, raw: unknown, ack: AckFn): Promise<void> {
    const data = socket.data;
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

    const decision = await runtime.handle(actorFor(command, data), command);
    if (!decision.ok) return ack({ ok: false, error: decision.rejection });

    // Effets sur les connexions, que le moteur ne connaît pas : rooms, présence, jetons.
    switch (command.type) {
      case 'JOIN_GAME': {
        const joined = findEvent(decision.events, 'PLAYER_JOINED');
        if (!joined) break;
        const playerToken = registry.issueToken(data.gameId, 'player', joined.playerId);
        bindPlayer(socket, joined.playerId);
        ack({ ok: true, data: { playerId: joined.playerId, playerToken } satisfies Joined });
        publisher.sendSnapshot(socket, runtime);
        return;
      }
      case 'LEAVE_GAME':
        if (data.playerId) unbindPlayer(socket, data.playerId);
        break;
      case 'KICK_PLAYER':
      case 'REMOVE_BOT': {
        const removed =
          findEvent(decision.events, 'PLAYER_KICKED') ?? findEvent(decision.events, 'PLAYER_LEFT');
        if (removed) await disconnectPlayer(data.gameId, removed.playerId);
        break;
      }
    }
    ack({ ok: true });
  }

  /** La connexion devient celle d'un joueur : room privée et présence. */
  function bindPlayer(socket: GameSocket, playerId: string): void {
    socket.data.playerId = playerId;
    void socket.join(playerRoom(playerId));
    presence.add(socket.data.gameId, playerId);
  }

  /** Le joueur quitte la partie de lui-même : son jeton ne sert plus, la connexion reste ouverte. */
  function unbindPlayer(socket: GameSocket, playerId: string): void {
    registry.revokePlayer(socket.data.gameId, playerId);
    presence.remove(socket.data.gameId, playerId);
    void socket.leave(playerRoom(playerId));
    socket.data.playerId = null;
  }

  /** L'hôte a retiré le joueur : jeton révoqué, téléphones prévenus puis déconnectés. */
  async function disconnectPlayer(gameId: string, playerId: string): Promise<void> {
    registry.revokePlayer(gameId, playerId);
    for (const socket of await io.in(playerRoom(playerId)).fetchSockets()) {
      socket.emit('removed', { reason: 'kicked' });
      socket.disconnect(true);
    }
  }
}
