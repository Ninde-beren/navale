# CLAUDE.md — navale-app

Monorepo pnpm TypeScript : moteur pur, protocole Zod, serveur Node, PWA React.

## Périmètre

Ne rien lire ni modifier hors de `navale/` sans demander. Le cahier des charges
est dans `../docs/`, à côté du dépôt et hors de lui (il n'est pas publié) : le lire
avant d'implémenter une fonctionnalité, et le mettre à jour quand une décision
change (toute divergence est un bug).

## Règles d'architecture

- `packages/engine` n'importe **rien** : ni Node, ni DOM, ni dépendance npm.
  Deux fonctions pures par jeu, `decide(state, command, ctx)` et
  `evolve(state, event)`, plus les projections `projectPublic` / `projectPrivate`.
- Le client envoie des **commandes**, le serveur publie des **événements**.
  Les deux vocabulaires ne se mélangent jamais (voir `packages/protocol`).
- Toute donnée qui sort du serveur passe par une projection. Aucun composant
  React ne reçoit l'état complet d'une partie.
- Toute règle de jeu est lue dans `settings`. Pas de constante métier dans le code.
- Le serveur ne fait confiance à aucun identifiant envoyé par le client : l'acteur
  d'une commande est déduit du jeton attaché à la connexion.

## Conventions

- TypeScript strict partout, `noUncheckedIndexedAccess` activé, pas de `any`.
- Zod est la seule source des types du protocole : `type X = z.infer<typeof XSchema>`.
- Composants fonctionnels, hooks. État client dans Zustand, piloté par les événements reçus.
- Tailwind pour la mise en page, CSS dédié pour le plateau et les animations.
- Pas de bibliothèque de composants métier (pas de MUI) : c'est un jeu, pas un back-office.
- Tests : Vitest. Le moteur est testé en premier et reste à 100 % de couverture.
  Un bug de règle se corrige en ajoutant d'abord le test qui le reproduit.
- Commits en français, préfixe conventionnel (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Notes de version dans `CHANGELOG.md` : chaque commit de `main` y figure avec son numéro
  (`git rev-list --count <commit>`, l'historique reste linéaire), dans la section de la
  feuille de route. Les compléter à chaque livraison.

## Ce qu'il ne faut pas faire

- Calculer un résultat de tir côté client, même « pour l'animation ».
- Envoyer la flotte d'un joueur à qui que ce soit d'autre que lui.
- Ajouter une règle de jeu sans la rendre paramétrable et sans la documenter dans le cahier des charges.
- Rejouer le journal d'événements à un client qui se reconnecte : il reçoit un instantané.
