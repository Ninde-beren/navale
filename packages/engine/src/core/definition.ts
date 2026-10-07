import type { Actor, Rejection } from '@navale/protocol';

export type { Actor, Rejection };

/** Résultat de `decide` : des événements à journaliser, ou un refus motivé. */
export type Decision<E> = { ok: true; events: E[] } | { ok: false; rejection: Rejection };

/**
 * Contexte injecté dans `decide`. Le moteur n'appelle jamais `Date.now()`,
 * `Math.random()` ni un générateur d'identifiants : tout vient d'ici, ce qui
 * rend chaque décision rejouable et testable.
 */
export interface DecideContext {
  actor: Actor;
  now: number;
  random: () => number;
  newId: () => string;
}

/**
 * Un jeu de la plateforme = un état, des commandes, des événements et deux
 * projections. La coquille (salle, code, QR, rôles, reconnexion, transport)
 * ne connaît que cette interface.
 */
export interface GameDefinition<S, C, E, PubV, PrivV, Init> {
  initialState(input: Init): S;
  decide(state: S, command: C, ctx: DecideContext): Decision<E>;
  evolve(state: S, event: E): S;
  projectPublic(state: S, presence?: Presence): PubV;
  projectPrivate(state: S, playerId: string, presence?: Presence): PrivV;
  isFinished(state: S): boolean;
  /** Prochaine échéance (chrono de manche) que le serveur doit armer, ou `null`. */
  nextDeadline(state: S): number | null;
}

/** Connexion de chaque joueur, maintenue par le transport, jointe aux projections. */
export type Presence = Readonly<Record<string, boolean>>;

export function ok<E>(events: E[]): Decision<E> {
  return { ok: true, events };
}

export function reject<E>(
  code: Rejection['code'],
  message: string,
  details?: unknown,
): Decision<E> {
  return {
    ok: false,
    rejection: details === undefined ? { code, message } : { code, message, details },
  };
}
