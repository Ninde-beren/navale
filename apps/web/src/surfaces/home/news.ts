/**
 * Les nouveautés de l'accueil, de la plus récente à la plus ancienne. Chacune porte
 * le numéro du commit qui l'a livrée : sa position dans l'historique de `main`,
 * `git rev-list --count <commit>`. On ajoute une entrée quand une nouveauté se voit
 * en jouant ; les corrections et le travail technique n'y figurent pas.
 */
export interface NewsItem {
  /** Numéro du commit qui livre la nouveauté. */
  n: number;
  day: string;
  title: string;
  text: string;
}

export const NEWS: readonly NewsItem[] = [
  {
    n: 65,
    day: '10 octobre',
    title: 'Les commandants',
    text: 'En option à la création : chacun choisit son commandant et joue sa capacité une fois, à la place d’un tir. Radar, missile ou réparation.',
  },
  {
    n: 64,
    day: '10 octobre',
    title: 'Un bot prend le relais',
    text: 'Un joueur injoignable quand vient son tour est remplacé par un bot. Il reprend la main dès qu’il revient.',
  },
  {
    n: 61,
    day: '9 octobre',
    title: 'Jouer à distance',
    text: 'Partage le lien de l’écran central : chacun l’ouvre chez lui et joue depuis son téléphone.',
  },
  {
    n: 58,
    day: '9 octobre',
    title: 'Ton téléphone se souvient de toi',
    text: 'Ton pseudo est proposé d’office, et ton bilan de victoires et de défaites reste sur ton téléphone.',
  },
  {
    n: 39,
    day: '9 octobre',
    title: 'La tablette à plat',
    text: 'Pose la tablette au milieu de la table : chaque grille se tourne vers son joueur.',
  },
  {
    n: 37,
    day: '9 octobre',
    title: 'Trois niveaux de bot',
    text: 'Facile, normal ou difficile, au choix pour chaque bot ajouté.',
  },
];
