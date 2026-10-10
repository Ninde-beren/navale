/** Ce que le filet attend du journal du serveur : la forme de pino (`app.log`). */
export interface LastResortLog {
  error(context: object, message: string): void;
  fatal(context: object, message: string): void;
}

/**
 * Filet de dernier recours, pour ce qu'aucun `catch` n'a rattrapé. Une promesse rejetée
 * sans gestionnaire est journalisée et le serveur continue : Node l'arrêterait sinon.
 * Une exception non rattrapée peut laisser un état incohérent : elle est journalisée,
 * puis `shutdown(1)` ferme proprement et sort en erreur. Docker relance le conteneur
 * (`restart: unless-stopped`) et les parties reviennent par leur journal.
 */
export function installLastResort(
  proc: Pick<NodeJS.Process, 'on'>,
  log: LastResortLog,
  shutdown: (exitCode: number) => void,
): void {
  proc.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'promesse rejetée sans gestionnaire');
  });
  proc.on('uncaughtException', (err) => {
    log.fatal({ err }, 'exception non rattrapée, arrêt du serveur');
    shutdown(1);
  });
}
