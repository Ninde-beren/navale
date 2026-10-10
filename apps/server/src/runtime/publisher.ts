import {
  battleship,
  burstStaggerMs,
  ghostLeadMs,
  privateRecipient,
  publicEvent,
  sameCoord,
} from '@navale/engine';
import type { EventEnvelope, GameView } from '@navale/protocol';
import type { PresenceTracker } from '../realtime/presence.js';
import { gameRoom, playerRoom, socketsInGame } from '../realtime/rooms.js';
import type { GameServer, GameSocket } from '../realtime/types.js';
import { contain, type FailureContext, type ReportFailure } from './failure.js';
import type { GameRuntime } from './game-runtime.js';

/**
 * Publie les événements aux bonnes rooms, au rythme de l'écran central :
 * tout ce qui suit un SHOT_RESOLVED est retardé de `revealDelayMs`, puis un
 * instantané à jour part vers chaque socket de la partie. Ce que chacun a le droit
 * de voir d'un événement, c'est le moteur qui le dit (`publicEvent`, `privateRecipient`).
 * Chaque envoi est isolé : une projection qui lève est signalée, sans arrêter le serveur
 * ni priver les autres connexions de la partie de leur instantané.
 */
export class Publisher {
  /** Par partie : l'heure de la dernière publication programmée. */
  private readonly releaseAt = new Map<string, number>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly io: GameServer,
    private readonly presence: PresenceTracker,
    private readonly report: ReportFailure = () => undefined,
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
      this.schedule(
        releaseAt - now,
        {
          gameId,
          during: 'publication d’un événement',
          seq: envelope.seq,
          event: envelope.event.type,
        },
        () => this.emitEvent(gameId, envelope),
      );
      const event = envelope.event;
      // Chaque tir, et chaque capacité jouée, a droit à son temps d'annonce sur l'écran central.
      // Les tirs d'une rafale de missile partent ensemble : l'écran central les fait décoller à
      // la suite et ne les annonce qu'une fois ; le délai suit le dernier, allongé des départs décalés.
      // Le barrage d'un fantôme aussi : ses tirs partent ensemble, vers chaque survivant.
      // Les cases qu'un fantôme éclaire ont leur annonce.
      if (event.type === 'SHOT_RESOLVED') {
        const next = envelopes[i + 1]?.event;
        const continues =
          next?.type === 'SHOT_RESOLVED' &&
          next.shooterId === event.shooterId &&
          ((event.burst !== undefined &&
            next.burst !== undefined &&
            sameCoord(next.burst.center, event.burst.center)) ||
            (event.barrage !== undefined && next.barrage !== undefined));
        const volley = event.burst?.size ?? event.barrage?.size ?? 1;
        const lead = event.barrage ? ghostLeadMs(delay) : 0;
        if (!continues) releaseAt += delay + lead + (volley - 1) * burstStaggerMs(delay);
      } else if (event.type === 'ABILITY_USED' && event.ability !== 'missile') {
        releaseAt += delay;
      } else if (event.type === 'CELLS_LIT') {
        releaseAt += delay + ghostLeadMs(delay);
      }
    });
    this.releaseAt.set(gameId, releaseAt);
    this.schedule(releaseAt - now, { gameId, during: 'envoi des instantanés' }, () =>
      this.sendSnapshots(runtime),
    );
  }

  private schedule(delay: number, context: FailureContext, fn: () => void): void {
    if (delay <= 0) {
      contain(this.report, context, fn);
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      contain(this.report, context, fn);
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
    for (const socket of socketsInGame(this.io, runtime.gameId))
      contain(
        this.report,
        { gameId: runtime.gameId, during: 'instantané', playerId: socket.data.playerId },
        () => this.sendSnapshot(socket, runtime),
      );
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
