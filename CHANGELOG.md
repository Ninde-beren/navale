# Notes de version

Chaque commit de `main` porte un numéro : sa position dans l’historique, du plus ancien (n°1)
au plus récent. L’historique est linéaire, donc le numéro d’un commit se retrouve avec
`git rev-list --count <commit>`. Les sections suivent la feuille de route : MVP, v1, v2, du plus
récent au plus ancien.

À jour jusqu’au n°65 (`9874e9f`). Le commit qui met ces notes à jour y entre à la
mise à jour suivante.

## n°64 à 65 · v2, en cours

_10 octobre 2026._ Un bot relaie un joueur absent, qui reprend la main à son retour. Commandants et capacités, premier lot : Amiral et son radar, Artificier et son missile, Ingénieur et sa réparation.

|  N° | Date       | Type      | Changement                                                         | Commit                                                            |
| --: | ---------- | --------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
|  65 | 2026-10-10 | Nouveauté | Commandants et capacités, premier lot (radar, missile, réparation) | [`9874e9f`](https://github.com/Ninde-beren/navale/commit/9874e9f) |
|  64 | 2026-10-10 | Nouveauté | Un bot relaie un joueur absent, qui reprend la main à son retour   | [`8feaa28`](https://github.com/Ninde-beren/navale/commit/8feaa28) |

## n°37 à 63 · v1

_9 et 10 octobre 2026._ Trois niveaux de bot et règle anti-acharnement. Mode tablette à plat, chaque grille tournée vers son joueur, à deux, trois et quatre. Bande d’information à trois joueurs. Pseudo et bilan retenus par le téléphone. Partage du lien de l’écran central pour jouer à distance. Licence PolyForm Noncommercial.

|  N° | Date       | Type       | Changement                                                                                           | Commit                                                            |
| --: | ---------- | ---------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|  63 | 2026-10-10 | Nouveauté  | Bouton « Voir l'écran » sur les parties ouvertes de /admin                                           | [`bda9801`](https://github.com/Ninde-beren/navale/commit/bda9801) |
|  62 | 2026-10-10 | Correction | Partage de l'écran central, une icône à droite du lien                                               | [`5b6440e`](https://github.com/Ninde-beren/navale/commit/5b6440e) |
|  61 | 2026-10-09 | Nouveauté  | Partage du lien de l'écran central pour jouer à distance                                             | [`b7242e7`](https://github.com/Ninde-beren/navale/commit/b7242e7) |
|  60 | 2026-10-09 | Correction | À trois et à plat, l'annonce du tir revient dans la bande                                            | [`386dfca`](https://github.com/Ninde-beren/navale/commit/386dfca) |
|  59 | 2026-10-09 | Correction | Écran central à trois, bande de 300 px, trois derniers coups, icônes en bas à droite                 | [`ab267d9`](https://github.com/Ninde-beren/navale/commit/ab267d9) |
|  58 | 2026-10-09 | Nouveauté  | Le téléphone retient le pseudo et le bilan victoires / défaites                                      | [`155eb92`](https://github.com/Ninde-beren/navale/commit/155eb92) |
|  57 | 2026-10-09 | Correction | Tablette à plat à quatre, grilles latérales recentrées et bande centrale supprimée                   | [`66f9cf0`](https://github.com/Ninde-beren/navale/commit/66f9cf0) |
|  56 | 2026-10-09 | Correction | Grilles latérales rapprochées à quatre, et l'annonce garde sa couleur pendant son fondu              | [`d48e913`](https://github.com/Ninde-beren/navale/commit/d48e913) |
|  55 | 2026-10-09 | Correction | Tablette à plat à quatre, deux annonces posées sur « Au tour de »                                    | [`f8675eb`](https://github.com/Ninde-beren/navale/commit/f8675eb) |
|  54 | 2026-10-09 | Correction | Au début du tour, le téléphone propose la cible du dernier tir                                       | [`1c1c177`](https://github.com/Ninde-beren/navale/commit/1c1c177) |
|  53 | 2026-10-09 | Nouveauté  | Tablette à plat à quatre, annonces au centre de chaque grille, trois coups, icônes sous le journal   | [`0422702`](https://github.com/Ninde-beren/navale/commit/0422702) |
|  52 | 2026-10-09 | Nouveauté  | Tablette à plat, petit historique des coups dans le journal                                          | [`d7f089d`](https://github.com/Ninde-beren/navale/commit/d7f089d) |
|  51 | 2026-10-09 | Nouveauté  | Tablette à plat à quatre, quatre annonces et coins réorganisés                                       | [`cbc7a15`](https://github.com/Ninde-beren/navale/commit/cbc7a15) |
|  50 | 2026-10-09 | Nouveauté  | Tablette à plat à quatre, les grilles en croix sans bande centrale, d'après le croquis d'Antoine     | [`2c5e363`](https://github.com/Ninde-beren/navale/commit/2c5e363) |
|  49 | 2026-10-09 | Nouveauté  | Écran central à trois, la bande d'information en haut dans les deux modes                            | [`c5653c5`](https://github.com/Ninde-beren/navale/commit/c5653c5) |
|  48 | 2026-10-09 | Correction | Tablette à plat à trois, réserve en bas pour que les grilles ne touchent pas les icônes              | [`b7662b0`](https://github.com/Ninde-beren/navale/commit/b7662b0) |
|  47 | 2026-10-09 | Nouveauté  | Tablette à plat à trois, bande d'information en haut et trois grilles centrées en dessous            | [`ae7c7f2`](https://github.com/Ninde-beren/navale/commit/ae7c7f2) |
|  46 | 2026-10-09 | Correction | Tablette à plat à trois, pas de copie retournée du centre, personne en face                          | [`9c237dc`](https://github.com/Ninde-beren/navale/commit/9c237dc) |
|  45 | 2026-10-09 | Correction | Tablette à plat à trois sans chevauchement, Quitter en fin de partie, pas de création sur smartphone | [`1a23a6a`](https://github.com/Ninde-beren/navale/commit/1a23a6a) |
|  44 | 2026-10-09 | Correction | Tablette à plat à deux, « Au tour de » et callout tournés vers les petits côtés                      | [`0c81624`](https://github.com/Ninde-beren/navale/commit/0c81624) |
|  43 | 2026-10-09 | Nouveauté  | Tablette à plat, colonne centrale réduite et grilles agrandies à deux et à trois                     | [`8711b13`](https://github.com/Ninde-beren/navale/commit/8711b13) |
|  42 | 2026-10-09 | Correction | Tablette à plat, effets de tir calés sur l'écran et « Au tour de » dos à dos au milieu               | [`12e9d6d`](https://github.com/Ninde-beren/navale/commit/12e9d6d) |
|  41 | 2026-10-09 | Docs       | Plus de renvois au cahier des charges, qui n'est pas publié                                          | [`838de49`](https://github.com/Ninde-beren/navale/commit/838de49) |
|  40 | 2026-10-09 | Technique  | Licence PolyForm Noncommercial, adresse d'exemple dans les tests                                     | [`844e820`](https://github.com/Ninde-beren/navale/commit/844e820) |
|  39 | 2026-10-09 | Nouveauté  | Tablette à plat, chaque grille tournée vers son joueur                                               | [`d755afd`](https://github.com/Ninde-beren/navale/commit/d755afd) |
|  38 | 2026-10-09 | Nouveauté  | Règle anti-acharnement, au plus N tirs de suite sur le même joueur                                   | [`83f4b72`](https://github.com/Ninde-beren/navale/commit/83f4b72) |
|  37 | 2026-10-09 | Nouveauté  | Niveaux du bot, facile, normal et difficile, choisis dans le lobby                                   | [`b69e553`](https://github.com/Ninde-beren/navale/commit/b69e553) |

## n°27 à 36 · Retours des joueurs, administration, publication

_9 octobre 2026._ Bouton « Un avis, un souci ? » sur toutes les pages, retours envoyés par mail. Espace d’administration. Code relu et allégé, des paquets plutôt que du code maison, avant la publication du dépôt.

|  N° | Date       | Type       | Changement                                                                       | Commit                                                            |
| --: | ---------- | ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|  36 | 2026-10-09 | Technique  | Mailjet par le paquet officiel node-mailjet, comme le service de mail de Tutotou | [`21841e4`](https://github.com/Ninde-beren/navale/commit/21841e4) |
|  35 | 2026-10-09 | Technique  | Paquets à la place du code maison, code relu pour la publication                 | [`9a84793`](https://github.com/Ninde-beren/navale/commit/9a84793) |
|  34 | 2026-10-09 | Nouveauté  | Expéditeur des mails en deux variables, MAIL_FROM_EMAIL et MAIL_FROM_NAME        | [`89c9b22`](https://github.com/Ninde-beren/navale/commit/89c9b22) |
|  33 | 2026-10-09 | Correction | Lire PUBLIC_URL dans le .env sans le sourcer                                     | [`ce6bbe8`](https://github.com/Ninde-beren/navale/commit/ce6bbe8) |
|  32 | 2026-10-09 | Correction | L'erreur Mailjet dit pourquoi, clés inconnues ou raison renvoyée par l'API       | [`f6da692`](https://github.com/Ninde-beren/navale/commit/f6da692) |
|  31 | 2026-10-09 | Nouveauté  | Espace d'administration /admin, parties en ligne, joueurs, historique et retours | [`5e3c0c2`](https://github.com/Ninde-beren/navale/commit/5e3c0c2) |
|  30 | 2026-10-09 | Nouveauté  | Envoi des retours par Mailjet, le compte du service de mail de Tutotou           | [`f153428`](https://github.com/Ninde-beren/navale/commit/f153428) |
|  29 | 2026-10-09 | Tests      | Le corps injecté est un objet, pour que le typecheck des tests passe             | [`b1dc3ee`](https://github.com/Ninde-beren/navale/commit/b1dc3ee) |
|  28 | 2026-10-09 | Correction | L'adresse du client est la dernière de X-Forwarded-For, posée par le proxy       | [`c8112e8`](https://github.com/Ninde-beren/navale/commit/c8112e8) |
|  27 | 2026-10-09 | Nouveauté  | Bouton « Un avis, un souci ? » partout, retours en base et par mail              | [`b81d71b`](https://github.com/Ninde-beren/navale/commit/b81d71b) |

## n°9 à 26 · Mise en ligne et finitions

_8 et 9 octobre 2026._ En ligne sur https://navale.sigilbo.fr. Effets et sons de tir retravaillés, musique et jingle de coulé. Scanner de QR code sur l’accueil du téléphone. Accueil en page vitrine avec aperçu des liens partagés. Page « Nouvelle partie » au format ordinateur et tablette, sans défilement.

|  N° | Date       | Type           | Changement                                                                                | Commit                                                            |
| --: | ---------- | -------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|  26 | 2026-10-09 | Nouveauté      | Textes de l'accueil vitrine réécrits, scène vue du dessus avec la tablette au milieu      | [`04f231f`](https://github.com/Ninde-beren/navale/commit/04f231f) |
|  25 | 2026-10-09 | Correction     | « Nouvelle partie » garde des tailles tactiles tout en tenant dans la hauteur             | [`fad2963`](https://github.com/Ninde-beren/navale/commit/fad2963) |
|  24 | 2026-10-08 | Nouveauté      | La page « Nouvelle partie » tient sans défilement sur un écran d'ordinateur               | [`f8cafe2`](https://github.com/Ninde-beren/navale/commit/f8cafe2) |
|  23 | 2026-10-08 | Nouveauté      | L'aperçu de la création montre ratés, touche et bateau coulé selon l'option               | [`6964857`](https://github.com/Ninde-beren/navale/commit/6964857) |
|  22 | 2026-10-08 | Retour arrière | Accueil remis dans l'état validé par Antoine (b2f7b56)                                    | [`db7205a`](https://github.com/Ninde-beren/navale/commit/db7205a) |
|  21 | 2026-10-08 | Nouveauté      | Pages de message au format large sur ordinateur et tablette                               | [`20d4330`](https://github.com/Ninde-beren/navale/commit/20d4330) |
|  20 | 2026-10-08 | Nouveauté      | Page de création au format ordinateur et tablette                                         | [`2b5ff35`](https://github.com/Ninde-beren/navale/commit/2b5ff35) |
|  19 | 2026-10-08 | Correction     | À trois joueurs, « Suivre la partie » remonte sous le code                                | [`be6ab27`](https://github.com/Ninde-beren/navale/commit/be6ab27) |
|  18 | 2026-10-08 | Correction     | Les cases se réduisent pour qu'une grille 10×10 tienne dans sa zone                       | [`9270ced`](https://github.com/Ninde-beren/navale/commit/9270ced) |
|  17 | 2026-10-08 | Correction     | Le service worker revérifie une nouvelle version chaque minute                            | [`994bb21`](https://github.com/Ninde-beren/navale/commit/994bb21) |
|  16 | 2026-10-08 | Nouveauté      | Accueil en page vitrine, aperçu des liens partagés, site non indexé                       | [`b2f7b56`](https://github.com/Ninde-beren/navale/commit/b2f7b56) |
|  15 | 2026-10-08 | Nouveauté      | Scanner de QR code sur l'accueil smartphone ; fix de la plaque du tireur                  | [`c6f4269`](https://github.com/Ninde-beren/navale/commit/c6f4269) |
|  14 | 2026-10-08 | Nouveauté      | Résolution dans l'ordre d'engagement, le plus rapide d'abord                              | [`4410b05`](https://github.com/Ninde-beren/navale/commit/4410b05) |
|  13 | 2026-10-08 | Correction     | La trace du missile s'efface après l'impact                                               | [`ef12da9`](https://github.com/Ninde-beren/navale/commit/ef12da9) |
|  12 | 2026-10-08 | Nouveauté      | Chargement au lancement, musique de fond, jingle de coulé par joueur, retours d'ergonomie | [`4ecaf19`](https://github.com/Ninde-beren/navale/commit/4ecaf19) |
|  11 | 2026-10-08 | Nouveauté      | Clé SSH, repli tar sans rsync, santé du conteneur puis de l'URL publique                  | [`0ed54fc`](https://github.com/Ninde-beren/navale/commit/0ed54fc) |
|  10 | 2026-10-08 | Nouveauté      | Réseau web du Caddy partagé, domaine navale.sigilbo.fr ; cases touchées braise            | [`8506fbd`](https://github.com/Ninde-beren/navale/commit/8506fbd) |
|   9 | 2026-10-08 | Nouveauté      | Tir blanc, feu orange, case touchée à la couleur du joueur ; son sans clignotement        | [`7a6b129`](https://github.com/Ninde-beren/navale/commit/7a6b129) |

## n°1 à 8 · MVP, jalons M1 à M6

_7 et 8 octobre 2026._ La partie complète, du moteur à la mise en ligne : moteur pur et testé, serveur temps réel, écran central et téléphone, tir confirmé et séquence animée, bots, reconnexion et reprise après redémarrage, revanche, salve, sons, PWA, image Docker et déploiement d’une commande.

|  N° | Date       | Type       | Changement                                                                        | Commit                                                            |
| --: | ---------- | ---------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|   8 | 2026-10-08 | Nouveauté  | M6 · Image Docker, compose, serveur qui sert le web, déploiement d'une commande   | [`517d0dd`](https://github.com/Ninde-beren/navale/commit/517d0dd) |
|   7 | 2026-10-08 | Correction | Le raté fait plouf, plus paf                                                      | [`1d99048`](https://github.com/Ninde-beren/navale/commit/1d99048) |
|   6 | 2026-10-08 | Nouveauté  | M5 · Revanche, salve à l'écran et au téléphone, sons, Wake Lock, PWA              | [`ec8244d`](https://github.com/Ninde-beren/navale/commit/ec8244d) |
|   5 | 2026-10-07 | Nouveauté  | M4 · Fiabilité, expiration, chrono de manche, exclusion, départ, annulation       | [`2b1a42e`](https://github.com/Ninde-beren/navale/commit/2b1a42e) |
|   4 | 2026-10-07 | Nouveauté  | M3 · Tir depuis le téléphone, séquence animée de l'écran central, bots qui jouent | [`b444283`](https://github.com/Ninde-beren/navale/commit/b444283) |
|   3 | 2026-10-07 | Nouveauté  | M2 · Serveur Fastify + Socket.IO + SQLite, et application web jusqu'au lancement  | [`c7cd75c`](https://github.com/Ninde-beren/navale/commit/c7cd75c) |
|   2 | 2026-10-07 | Nouveauté  | M1 · Socle du monorepo, protocole Zod et moteur de bataille navale testé          | [`6743520`](https://github.com/Ninde-beren/navale/commit/6743520) |
|   1 | 2026-10-07 | Technique  | Squelette initial du monorepo navale-app                                          | [`ed48198`](https://github.com/Ninde-beren/navale/commit/ed48198) |
