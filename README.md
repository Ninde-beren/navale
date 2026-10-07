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

Jalons M1 et M2 livrés : moteur et protocole testés, serveur et application web
jouables jusqu'au lancement de la partie. Le tir depuis le téléphone et
l'animation de l'écran central arrivent au jalon M3 (`../docs/07-roadmap.md`).
Prérequis : Node 22 ou plus (le serveur utilise `node:sqlite`), pnpm 10.

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
`PUBLIC_URL` (défaut `https://<ip-lan>:5250`, c'est ce que le QR encode),
`DATA_DIR` (`./data`, journal SQLite), `LOG_LEVEL`.

Le journal SQLite de développement est dans `apps/server/data/`, ignoré par git.
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

Un conteneur Docker, une seule origine : Fastify sert l'API, le WebSocket et le
build web. Caddy termine le TLS sur le VPS. Voir `../docs/06-architecture.md`.
