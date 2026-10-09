import type { Presence } from '@navale/engine';
import type { EventEnvelope } from '@navale/protocol';
import type { GameRuntime } from './game-runtime.js';

/**
 * Joueur absent : quand un humain attendu pour tirer est déconnecté depuis
 * `settings.afkBotSeconds`, l'acteur `system` le fait relayer par un bot
 * (SUBSTITUTE_PLAYER) ; dès qu'il revient, il reprend la main (RESUME_PLAYER).
 * Le compte à rebours ne court que tant qu'on l'attend : un absent dont ce n'est
 * pas le tour n'est pas touché, et il s'arrête s'il revient, tire ou n'est plus attendu.
 */
export class AfkSubstitution {
  /** Un compte à rebours par joueur attendu et absent, sous la clé `gameId:playerId`. */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly presence: { of(gameId: string): Presence }) {}

  /** Après chaque lot d'événements : la manche, les tirs engagés ou les relais ont pu changer. */
  onEvents(runtime: GameRuntime, _envelopes: EventEnvelope[]): void {
    this.review(runtime);
  }

  /** Un joueur vient de se connecter, ou de perdre sa dernière connexion. */
  onPresence(runtime: GameRuntime, playerId: string, connected: boolean): void {
    if (!connected) {
      this.review(runtime);
      return;
    }
    this.clear(`${runtime.gameId}:${playerId}`);
    const player = runtime.state.players.find((p) => p.playerId === playerId);
    if (player && player.substitute !== null)
      void runtime.handle({ kind: 'system' }, { type: 'RESUME_PLAYER', playerId });
  }

  /** Reprise après redémarrage : les absents attendus repartent de zéro. */
  resume(runtime: GameRuntime): void {
    this.review(runtime);
  }

  /** Qui sera relayé s'il ne revient pas : attendu, humain, vivant, ni relayé ni engagé, déconnecté. */
  private waiting(runtime: GameRuntime): string[] {
    const { state, gameId } = runtime;
    const round = state.round;
    // Les journaux d'avant ce réglage n'ont pas `afkBotSeconds` : on les laisse attendre.
    if (state.status !== 'PLAYING' || !round || (state.settings.afkBotSeconds ?? null) === null)
      return [];
    const presence = this.presence.of(gameId);
    return round.expectedShooters.filter((id) => {
      const p = state.players.find((x) => x.playerId === id);
      return (
        p !== undefined &&
        p.kind === 'human' &&
        p.status === 'ALIVE' &&
        p.substitute === null &&
        !round.committed[id] &&
        !presence[id]
      );
    });
  }

  private review(runtime: GameRuntime): void {
    const waiting = new Set(this.waiting(runtime));
    const prefix = `${runtime.gameId}:`;
    for (const key of [...this.timers.keys()])
      if (key.startsWith(prefix) && !waiting.has(key.slice(prefix.length))) this.clear(key);
    for (const playerId of waiting) this.arm(runtime, playerId);
  }

  private arm(runtime: GameRuntime, playerId: string): void {
    const key = `${runtime.gameId}:${playerId}`;
    if (this.timers.has(key)) return;
    const seconds = runtime.state.settings.afkBotSeconds ?? 0;
    const timer = setTimeout(() => {
      this.timers.delete(key);
      // Les conditions ont pu changer pendant le délai : on revérifie avant de relayer.
      if (this.waiting(runtime).includes(playerId))
        void runtime.handle({ kind: 'system' }, { type: 'SUBSTITUTE_PLAYER', playerId });
    }, seconds * 1000);
    this.timers.set(key, timer);
  }

  private clear(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  close(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
