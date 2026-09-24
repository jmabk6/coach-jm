/**
 * Conseils des objectifs (M7, conception V2 § 3.6.3), contenu statique
 * choisi par `adviceKey`. Rubriques : fréquence, comment progresser,
 * points techniques, erreurs à éviter (et la mesure, quand elle compte).
 *
 * - Traction : le texte validé de la maquette M7.
 * - Objectifs 2 à 7 : premier jet de la section 9, **à valider** — l'écran
 *   affiche « Conseils en cours de validation » tant que `draft` est vrai.
 *   Aucun exercice nouveau (seulement les exercices liés de D10), aucun
 *   chiffre de résultat attendu.
 */

export interface AdviceSession {
  letter: string;
  title: string;
  exercises: string[];
  aim: string;
}

export interface GoalAdvice {
  draft: boolean;
  frequency: string;
  /** Traction : les trois séances du programme V1 qui la travaillent. */
  sessions?: AdviceSession[];
  progress: Array<{ label?: string; text: string }>;
  technique: string[];
  mistakes: string[];
  measure?: string;
}

export const GOAL_ADVICE: Record<string, GoalAdvice> = {
  traction: {
    draft: false,
    frequency: "3 séances par semaine, selon ton programme V1.",
    sessions: [
      { letter: "A", title: "Séance A — Force", exercises: ["Traction assistée", "Rowing poulie basse"], aim: "Objectif : gagner de la force." },
      { letter: "B", title: "Séance B — Contrôle", exercises: ["Traction négative", "Tirage vertical"], aim: "Objectif : améliorer le contrôle." },
      {
        letter: "C",
        title: "Séance C — Technique",
        exercises: ["Pullover poulie bras tendus", "Suspension + omoplates"],
        aim: "Objectif : renforcer le dos et la connexion aux omoplates.",
      },
    ],
    progress: [
      { label: "Régularité", text: "3 séances par semaine (A, B, C)." },
      { label: "Qualité du mouvement", text: "amplitude complète, menton au-dessus de la barre." },
      {
        label: "Règle de progression",
        text: "quand tu réussis 3 × 8 répétitions propres à RPE 8 ou moins, passer un cran d'assistance en moins (la taille d'un cran dépend de la machine).",
      },
      { label: "Renforcement global", text: "dos, épaules, gainage et contrôle des omoplates." },
    ],
    technique: ["Prise large, poitrine sortie.", "Amplitude complète, menton au-dessus de la barre.", "Omoplates activées et contrôlées."],
    mistakes: [
      "Amplitude incomplète (menton ne passe pas la barre).",
      "Balancer le corps ou utiliser l'élan.",
      "Relâcher les omoplates en fin de mouvement.",
      "Aller trop vite sur la phase négative.",
      "Compromettre la technique pour réduire l'assistance.",
    ],
  },

  upper_body: {
    draft: true,
    frequency: "2 séances par semaine qui le travaillent (Muscu A et Muscu B).",
    progress: [
      { text: "Double progression." },
      { text: "Quand toutes les séries atteignent le haut de la fourchette à RPE ≤ 8, ajouter 2,5 kg à la séance suivante." },
      { text: "Garder la même machine et le même réglage de siège pour comparer." },
    ],
    technique: [
      "Omoplates serrées et basses sur les tirages et les poussées.",
      "Amplitude complète.",
      "Descente contrôlée, environ 2 secondes.",
    ],
    mistakes: [
      "Hausser les épaules sur les élévations latérales.",
      "Cambrer sur le développé incliné.",
      "Augmenter la charge au détriment de l'amplitude.",
    ],
    measure: "Tour d'épaules et tour de taille, le matin, même mètre ruban, même position. Seul le ratio compte, pas chaque tour séparément.",
  },

  legs: {
    draft: true,
    frequency: "2 séances par semaine qui les travaillent (Muscu A et Muscu C).",
    progress: [
      { label: "Charges", text: "+5 kg quand toutes les séries atteignent le haut de la fourchette à RPE ≤ 8." },
      {
        label: "Sprints",
        text: "même vélo, même résistance, et viser la même puissance du premier au dernier sprint avant d'augmenter la résistance.",
      },
    ],
    technique: [
      "Genoux dans l'axe des pieds (squat, presse, montée sur banc).",
      "Dos neutre.",
      "Chaise à 60° : dos plaqué au mur, poids sur les talons.",
    ],
    mistakes: ["Laisser les genoux rentrer vers l'intérieur.", "Réduire l'amplitude pour tenir la charge.", "Sprinter sans échauffement."],
  },

  cardio: {
    draft: true,
    frequency: "3 séances par semaine (Cardio A, B et C).",
    progress: [
      {
        label: "La durée d'abord",
        text: "allonger Cardio C de 5 min quand c'est confortable, jusqu'à 90 min, avant d'augmenter l'intensité.",
      },
      { text: "L'indicateur baisse quand la forme s'améliore : même effort, cœur plus calme." },
    ],
    technique: [
      "Cardio A et C à allure où l'on peut parler.",
      "Cardio B : effort franc sur la minute rapide, récupération réelle sur les deux minutes lentes.",
    ],
    mistakes: [
      "Transformer chaque séance en séance difficile.",
      "Comparer des tests faits à des heures ou dans des états de fatigue très différents.",
    ],
    measure: "Même tapis, 5 km/h, pente 8 %, 20 min ; relever la FC chaque minute de la 16e à la 20e.",
  },

  core: {
    draft: true,
    frequency: "Quelques minutes, plusieurs soirs par semaine, avec les routines du soir (contenu à définir).",
    progress: [
      { text: "Allonger la durée de maintien en gardant une position parfaite, plutôt que de tenir plus longtemps en position dégradée." },
    ],
    technique: [
      "Planche sur les avant-bras.",
      "Coudes sous les épaules.",
      "Corps aligné de la tête aux talons.",
      "Ventre et fessiers serrés.",
      "Respiration continue.",
    ],
    mistakes: ["Bassin qui descend (dos creusé) ou qui monte.", "Bloquer la respiration."],
    measure: "1 essai, durée maximale en bonne forme ; arrêt dès que le bassin descend ou monte franchement.",
  },

  flexibility: {
    draft: true,
    frequency: "Courte et régulière, le soir, avec les routines (contenu à définir).",
    progress: [{ text: "Régularité plutôt qu'intensité ; aucune douleur vive." }],
    technique: ["S'échauffer légèrement avant.", "Expirer en allant dans l'étirement.", "Garder chaque position sans à-coups."],
    mistakes: [
      "Forcer en rebonds.",
      "Comparer des mesures prises à froid et après échauffement (le protocole fixe l'état de mesure).",
    ],
    measure: "Doigts-sol : 0 = contact, positif au-dessus du sol, négatif au-delà ; plus bas = mieux. Apley et Papillon en indicateurs secondaires.",
  },

  weight: {
    draft: true,
    frequency: "Une pesée chaque matin, dans les mêmes conditions (au lever, après être allé aux toilettes, avant de manger).",
    progress: [
      { text: "Regarder la moyenne de la semaine, jamais la pesée du jour ; les variations quotidiennes (eau, sel, entraînement) sont normales." },
    ],
    technique: [],
    mistakes: ["Réagir à une seule pesée.", "Changer de balance.", "Se peser à des heures différentes."],
    measure: "Moyenne de la semaine du dimanche au samedi, à partir de 3 pesées ; la semaine en cours est provisoire.",
  },
};
