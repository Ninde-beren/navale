import { configFromEnv, lanIp } from './config.js';
import { createApp } from './app.js';

const config = configFromEnv();
const server = await createApp(config);
await server.listen();
server.app.log.info(
  `Navale · serveur sur http://${lanIp()}:${config.port} · ${server.restored} partie(s) restaurée(s) · téléphones : ${config.publicUrl}`,
);
