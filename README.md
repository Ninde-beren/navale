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

## Amorçage

Le squelette ne contient pas encore de code. Prérequis : Node 24 LTS, pnpm 10.

```bash
pnpm init
printf 'packages:\n  - "packages/*"\n  - "apps/*"\n' > pnpm-workspace.yaml
mkdir -p packages/engine packages/protocol apps/server
pnpm create vite apps/web --template react-ts
```

Puis suivre `../docs/07-roadmap.md`, jalon « Socle ». L'arborescence cible
détaillée est dans `../docs/06-architecture.md`.

## Commandes (contrat)

```bash
pnpm dev          # serveur (5251) + web (5250, HTTPS, proxy /api et /socket.io vers le serveur)
pnpm test         # Vitest, tous les paquets ; le moteur doit rester à 100 % de couverture
pnpm lint         # ESLint + Prettier
pnpm build        # build de tous les paquets, le web dans apps/web/dist
pnpm start        # serveur de production : sert aussi apps/web/dist
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
