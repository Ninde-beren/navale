# navale-app

Application de Navale : plateforme de jeu multi-écrans (écran central + téléphones),
premier jeu bataille navale. Un seul monorepo pnpm, un seul dépôt git.

## Layout

```
navale-app/
├── packages/engine     moteur de jeu pur (zéro dépendance), event-sourced
├── packages/protocol   schémas Zod partagés : commandes, événements, vues
├── apps/server         Node + Fastify + Socket.IO + journal d'événements SQLite
└── apps/web            React + Vite + PWA : surfaces /board (écran central) et /play (téléphone)
```

Le cahier des charges est dans `../docs/`. Lire `../docs/README.md` puis
`../docs/06-architecture.md` avant de toucher au code.

## État

Jalons M1 à M5 livrés : moteur et protocole testés, serveur et application web
jouables de bout en bout dans les deux variantes, seul contre des bots ou à
plusieurs, avec reconnexion, reprise après redémarrage, revanche, sons, Wake
Lock et PWA installable. Reste le jalon M6, le déploiement
(`../docs/07-roadmap.md`). Prérequis : Node 22 ou plus (le serveur utilise
`node:sqlite`), pnpm 10.

## Commandes

```bash
pnpm install
pnpm test               # Vitest, tous les paquets ; `pnpm test -- scenario` joue une partie en console
pnpm vitest run --coverage
pnpm typecheck          # tsc sur chaque paquet
pnpm lint               # ESLint + Prettier
pnpm format
```

```bash
pnpm dev          # serveur (5251) + web (5250, HTTPS, proxy /api et /socket.io vers le serveur)
WEB_HTTPS=0 WEB_PORT=5260 pnpm --filter @navale/web dev   # web en HTTP clair (outils sans certificat)
pnpm build        # build de tous les paquets, le web dans apps/web/dist
```

Variables du serveur : `PORT` (5251), `WEB_PORT` (5250, pour l'URL par défaut),
`PUBLIC_URL` (défaut `https://<ip-lan>:5250`, c'est ce que le QR encode, et la
base de l'image d'aperçu des liens partagés, posée dans `index.html` au démarrage),
`DATA_DIR` (`./data`, journal SQLite), `LOG_LEVEL`.

Le journal SQLite de développement est dans `apps/server/data/`, ignoré par git.

L'image d'aperçu des liens (`apps/web/public/og-image.jpg`, 1200×630) est une
photo de la route `/og-card`, servie en développement seulement : la commande
pour la régénérer est en tête de `apps/web/src/surfaces/home/OgCard.tsx`.
`pnpm start` et l'image Docker arrivent au jalon M6.

## Le moteur en deux fonctions

```ts
import { battleship, makeSettings } from '@navale/engine';

const settings = makeSettings({ variant: 'sequential', maxPlayers: 3 }, 'quick');
let state = battleship.initialState({ gameId, code, settings, createdAt: Date.now() });
const decision = battleship.decide(state, command, { actor, now, random, newId });
if (decision.ok) for (const event of decision.events) state = battleship.evolve(state, event);
const board = battleship.projectPublic(state); // écran central, spectateurs
const mine = battleship.projectPrivate(state, playerId); // téléphone du joueur
```

## Tourner en local (prototype)

Tout tourne sur la machine de développement. Les téléphones rejoignent via le
Wi-Fi local :

1. `pnpm dev` démarre le serveur et Vite en HTTPS (certificat auto-signé).
2. Le QR code affiché par l'écran central encode `PUBLIC_URL`, qui vaut par
   défaut `https://<ip-lan>:5250`. Le serveur détecte l'IP LAN si la variable
   n'est pas définie.
3. Sur le téléphone, accepter une fois l'avertissement de certificat.

Pour tester hors du Wi-Fi local, un tunnel (`cloudflared tunnel --url https://localhost:5250`)
suffit : définir `PUBLIC_URL` sur l'URL du tunnel.

## Déploiement

Un conteneur, une seule origine : Fastify sert l'API, le WebSocket et le build
web sur le port 5251. Caddy, ou tout reverse proxy, termine le TLS devant.

### Sur le serveur, une fois

1. Docker et Docker Compose. Le conteneur écrit le journal SQLite dans `./data`
   avec l'uid 1000 : le dossier doit appartenir à cet utilisateur.
2. Le DNS : `navale.sigilbo.fr` en A vers le VPS.
3. Le conteneur rejoint le réseau Docker externe `web` du Caddy partagé
   (`infra-docker`). Ajouter le bloc de `deploy/Caddyfile.example` au
   `infra/Caddyfile` d'infra-docker, puis `docker compose exec caddy caddy reload
--config /etc/caddy/Caddyfile` : Caddy joint `navale:5251` par son nom,
   WebSocket compris, certificat automatique.

### À chaque livraison, une commande

```bash
NAVALE_HOST=debian@mon-vps PUBLIC_URL=https://navale.exemple.fr deploy/deploy.sh
```

Le script copie le dépôt par rsync (sans `node_modules`, `data` ni `.git`),
écrit `PUBLIC_URL` dans `.env` sur le serveur, construit l'image là-bas
(`docker compose up -d --build`) et attend que `/api/health` réponde sur l'URL
publique. `NAVALE_DIR` change le dossier cible (défaut `/srv/navale`).

### À la main

```bash
cp .env.example .env     # PUBLIC_URL obligatoire
mkdir -p data
docker compose up -d --build
curl -s localhost:5251/api/health
```

Variables du `.env` : `PUBLIC_URL` (obligatoire, l'URL que voient les
téléphones), `WEB_NETWORK` (réseau externe du reverse proxy, `web`),
`LOG_LEVEL` (`info`, ou `debug` pour chercher), `NAVALE_PORT` et `BIND` (port et
interface exposés hors Docker, `127.0.0.1:5251`). Dans le
conteneur : `PORT`, `DATA_DIR=/data`, `WEB_DIST=/app/web`, `NAVALE_VERSION`.

`/api/health` renvoie `{ ok, games, uptime, version }`. Les logs sont du JSON
(pino) sur la sortie standard : `docker compose logs -f`.

Hors Docker, le serveur de production est un seul fichier (`pnpm build` produit
`apps/server/dist/main.cjs` avec esbuild) : `pnpm --filter @navale/server start`
le lance, avec `WEB_DIST` sur `apps/web/dist` et `PUBLIC_URL` défini.
