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

Jalon M1 livré : `packages/protocol` et `packages/engine` sont en place et testés.
`apps/server` et `apps/web` arrivent au jalon M2 (`../docs/07-roadmap.md`).
Prérequis : Node 22 ou plus, pnpm 10.

## Commandes

```bash
pnpm install
pnpm test               # Vitest, tous les paquets ; `pnpm test -- scenario` joue une partie en console
pnpm vitest run --coverage
pnpm typecheck          # tsc sur chaque paquet
pnpm lint               # ESLint + Prettier
pnpm format
```

À partir du jalon M2 :

```bash
pnpm dev          # serveur (5251) + web (5250, HTTPS, proxy /api et /socket.io vers le serveur)
pnpm build        # build de tous les paquets, le web dans apps/web/dist
pnpm start        # serveur de production : sert aussi apps/web/dist
```

## Le moteur en deux fonctions

```ts
import { battleship, makeSettings } from '@navale/engine';

const settings = makeSettings({ variant: 'sequential', maxPlayers: 3 }, 'quick');
let state = battleship.initialState({ gameId, code, settings, createdAt: Date.now() });
const decision = battleship.decide(state, command, { actor, now, random, newId });
if (decision.ok) for (const event of decision.events) state = battleship.evolve(state, event);
const board = battleship.projectPublic(state);          // écran central, spectateurs
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
