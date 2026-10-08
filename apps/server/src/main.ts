import { configFromEnv, lanIp } from './config.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const config = configFromEnv();
  const server = await createApp(config);
  await server.listen();
  server.app.log.info(
    `Navale · serveur sur http://${lanIp()}:${config.port} · ${server.restored} partie(s) restaurée(s) · téléphones : ${config.publicUrl}` +
      (config.webDist ? ` · web servi depuis ${config.webDist}` : ''),
  );
  // Arrêt propre (docker stop, systemd) : on ferme les sockets et la base avant de sortir.
  const stop = (signal: string) => {
    server.app.log.info(`${signal} reçu, arrêt`);
    void server.close().then(() => process.exit(0));
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
