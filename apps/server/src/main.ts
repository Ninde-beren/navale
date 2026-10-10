import { configFromEnv, lanIp } from './config.js';
import { createApp } from './app.js';
import { installLastResort } from './last-resort.js';

/** Au-delà, une fermeture qui traîne n'empêche plus la sortie : Docker relance derrière. */
const CLOSE_TIMEOUT_MS = 5000;

async function main(): Promise<void> {
  const config = configFromEnv();
  const server = await createApp(config);
  // Arrêt propre (docker stop, systemd, ou panne) : on ferme les sockets et la base avant de sortir.
  let stopping = false;
  const stop = (reason: string, exitCode: number) => {
    if (stopping) return;
    stopping = true;
    server.app.log.info(`${reason}, arrêt`);
    setTimeout(() => process.exit(exitCode), CLOSE_TIMEOUT_MS).unref();
    void server
      .close()
      .catch(() => undefined)
      .then(() => process.exit(exitCode));
  };
  installLastResort(process, server.app.log, (exitCode) =>
    stop('exception non rattrapée', exitCode),
  );
  process.once('SIGTERM', () => stop('SIGTERM reçu', 0));
  process.once('SIGINT', () => stop('SIGINT reçu', 0));
  await server.listen();
  server.app.log.info(
    `Navale · serveur sur http://${lanIp()}:${config.port} · ${server.restored} partie(s) restaurée(s)` +
      (server.broken.length
        ? ` · ${server.broken.length} mise(s) de côté, journal illisible (voir les erreurs)`
        : '') +
      ` · téléphones : ${config.publicUrl}` +
      (config.webDist ? ` · web servi depuis ${config.webDist}` : ''),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
