import { battleship, burstStepMs, privateRecipient, publicEvent, sameCoord } from '@navale/engine';
import type { EventEnvelope, GameView } from '@navale/protocol';
import type { PresenceTracker } from '../realtime/presence.js';
import { gameRoom, playerRoom, socketsInGame } from '../realtime/rooms.js';
import type { GameServer, GameSocket } from '../realtime/types.js';
import type { GameRuntime } from './game-runtime.js';

/**
 * Publie les événements aux bonnes rooms, au rythme de l'écran central :
 * tout ce qui suit un SHOT_RESOLVED est retardé de `revealDelayMs`, puis un
 * instantané à jour part vers chaque socket de la partie. Ce que chacun a le droit
 * de voir d'un événement, c'est le moteur qui le dit (`publicEvent`, `privateRecipient`).
 */
export class Publisher {
  /** Par partie : l'heure de la dernière publication programmée. */
  private readonly releaseAt = new Map<string, number>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly io: GameServer,
    private readonly presence: PresenceTracker,
  ) {}

  /** Quand l'écran central aura fini d'annoncer ce qui est déjà publié ; `now` si rien n'attend. */
  settledAt(gameId: string, now: number = Date.now()): number {
    return Math.max(now, this.releaseAt.get(gameId) ?? 0);
  }

  publish(runtime: GameRuntime, envelopes: EventEnvelope[]): void {
    const gameId = runtime.gameId;
    const now = Date.now();
    let releaseAt = this.settledAt(gameId, now);
    const delay = runtime.state.settings.revealDelayMs;
    envelopes.forEach((envelope, i) => {
      this.schedule(releaseAt - now, () => this.emitEvent(gameId, envelope));
      const event = envelope.event;
      // Chaque tir, et chaque capacité jouée, a droit à son temps d'annonce sur l'écran central ;
      // les tirs d'une rafale de missile partent à la suite et ne sont annoncés qu'une fois, au dernier.
      if (event.type === 'SHOT_RESOLVED') {
        const next = envelopes[i + 1]?.event;
        const continues =
          event.burst !== undefined &&
          next?.type === 'SHOT_RESOLVED' &&
          next.burst !== undefined &&
          next.shooterId === event.shooterId &&
          sameCoord(next.burst.center, event.burst.center);
        releaseAt += continues ? burstStepMs(delay) : delay;
      } else if (event.type === 'ABILITY_USED' && event.ability !== 'missile') {
        releaseAt += delay;
      }
    });
    this.releaseAt.set(gameId, releaseAt);
    this.schedule(releaseAt - now, () => this.sendSnapshots(runtime));
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

  private emitEvent(gameId: string, envelope: EventEnvelope): void {
    const recipient = privateRecipient(envelope.event);
    if (!recipient) {
      this.io.to(gameRoom(gameId)).emit('event', envelope);
      return;
    }
    this.io
      .to(gameRoom(gameId))
      .except(playerRoom(recipient))
      .emit('event', { ...envelope, event: publicEvent(envelope.event) });
    this.io.to(playerRoom(recipient)).emit('event', envelope);
  }

  /** La vue privée pour un joueur encore assis à la table, la vue publique pour tout le reste. */
  viewFor(socket: GameSocket, runtime: GameRuntime): GameView {
    const { playerId, isHost } = socket.data;
    const presence = this.presence.of(runtime.gameId);
    const seated = playerId !== null && runtime.state.players.some((p) => p.playerId === playerId);
    const view = seated
      ? battleship.projectPrivate(runtime.state, playerId, presence)
      : battleship.projectPublic(runtime.state, presence);
    return { ...view, isHost };
  }

  sendSnapshot(socket: GameSocket, runtime: GameRuntime): void {
    socket.emit('snapshot', this.viewFor(socket, runtime));
  }

  sendSnapshots(runtime: GameRuntime): void {
    for (const socket of socketsInGame(this.io, runtime.gameId)) this.sendSnapshot(socket, runtime);
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
