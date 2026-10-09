import { io as connect, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  Command,
  CreateGameRequest,
  CreateGameResponse,
  PlayerView,
  PresenceChange,
  RematchNotice,
  ServerToClientEvents,
  VisibleEnvelope,
} from '@navale/protocol';
import { createApp, type AppOptions } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';

/** Aides communes aux tests du serveur : un vrai serveur sur un port libre, de vrais sockets. */

export type TestServer = Awaited<ReturnType<typeof createApp>>;
export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attend que `condition` devienne vraie ; échoue au-delà de `timeoutMs`. */
export async function until(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('délai dépassé');
    await sleep(10);
  }
}

/**
 * Démarre un serveur sur un port libre. Par défaut : base en mémoire, journal
 * muet, et des bots qui jouent sans délai de réflexion.
 */
export async function startServer(
  options: { storePath?: string; config?: Partial<ServerConfig>; app?: AppOptions } = {},
): Promise<{ server: TestServer; baseUrl: string }> {
  const server = await createApp(
    {
      port: 0,
      dataDir: '/tmp',
      publicUrl: 'https://navale.test',
      logLevel: 'silent',
      ...options.config,
    },
    options.storePath ?? ':memory:',
    { botThinkMs: () => 0, ...options.app },
  );
  await server.listen();
  const address = server.app.server.address();
  if (!address || typeof address === 'string') throw new Error('adresse inconnue');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

/** Une connexion de test et tout ce qu'elle a reçu, dans l'ordre. */
export interface Client {
  socket: TestSocket;
  /** Le test sait s'il a ouvert une connexion de joueur : les vues sont typées comme telles. */
  snapshots: PlayerView[];
  events: VisibleEnvelope[];
  presence: PresenceChange[];
  rematches: RematchNotice[];
  /** Chaque message reçu, sérialisé, pour y chercher une fuite. */
  received: string[];
  messages: Array<{ name: string; payload: unknown }>;
}

/** Ouvre une connexion et attend son premier instantané ; rejette si le serveur refuse. */
export function open(baseUrl: string, auth: Record<string, unknown>): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = connect(baseUrl, {
      auth,
      transports: ['websocket'],
      reconnection: false,
    });
    const client: Client = {
      socket,
      snapshots: [],
      events: [],
      presence: [],
      rematches: [],
      received: [],
      messages: [],
    };
    socket.onAny((name: string, payload: unknown) => {
      client.received.push(JSON.stringify({ name, payload }));
      client.messages.push({ name, payload });
    });
    socket.on('snapshot', (view) => client.snapshots.push(view as PlayerView));
    socket.on('event', (envelope) => client.events.push(envelope));
    socket.on('presence', (change) => client.presence.push(change));
    socket.on('rematch', (notice) => client.rematches.push(notice));
    socket.on('rejected', (error) => reject(new Error(`rejected:${error.code}`)));
    socket.on('connect_error', reject);
    socket.once('snapshot', () => resolve(client));
  });
}

/** Le dernier instantané reçu. */
export function lastView(client: Client): PlayerView {
  const view = client.snapshots.at(-1);
  if (!view) throw new Error('aucun instantané reçu');
  return view;
}

/** Envoie une commande, même malformée, et attend l'accusé du serveur. */
export function command(socket: TestSocket, cmd: Command | Record<string, unknown>): Promise<Ack> {
  return socket.emitWithAck('command', cmd as Command);
}

/** Crée une partie par l'API ; par défaut, un tour par tour à deux sans délai d'annonce. */
export async function createGame(
  baseUrl: string,
  request: CreateGameRequest = {
    settings: { variant: 'sequential', maxPlayers: 2, revealDelayMs: 0 },
  },
): Promise<CreateGameResponse> {
  const res = await fetch(`${baseUrl}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return (await res.json()) as CreateGameResponse;
}
