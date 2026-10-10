/** Le contexte d'une panne, pour le journal du serveur : la partie, et ce qui était en cours. */
export interface FailureContext {
  gameId: string;
  /** Ce que faisait le serveur, en quelques mots : « chrono de manche », « tir du bot »… */
  during: string;
  [key: string]: unknown;
}

/** Signale une panne au journal du serveur (pino, `app.log.error`). */
export type ReportFailure = (err: unknown, context: FailureContext) => void;

/**
 * Lance `task` sans qu'aucune exception n'en sorte, qu'elle soit levée tout de suite ou par
 * la promesse rendue : elle est signalée, et le serveur continue avec les autres parties.
 * Pour tout ce qui part d'une minuterie, d'un événement de connexion ou des suites d'une
 * commande déjà journalisée : là, personne d'autre ne rattraperait l'exception.
 */
export function contain(report: ReportFailure, context: FailureContext, task: () => unknown): void {
  try {
    const result = task();
    if (result instanceof Promise) result.catch((err: unknown) => report(err, context));
  } catch (err) {
    report(err, context);
  }
}
