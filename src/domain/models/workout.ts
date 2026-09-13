import type { Id, Load } from "./exercise";
import type {
  ExerciseInstructions,
  GroupChildInstructions,
} from "./session";

export type WorkoutStatus =
  | "in_progress"
  | "completed";

export type WorkoutSource =
  | "planned"
  | "free";

export type PerformedBlockStatus =
  | "performed"
  | "skipped"
  | "not_performed";

export interface WorkoutSession {
  id: Id;

  /**
   * Réalisation rattachée à une instance planifiée, si elle existe.
   * Absent pour une séance libre.
   */
  plannedSessionId?: Id;

  /**
   * Référence vers le modèle utilisé au démarrage.
   * Peut être absent pour une séance libre créée vide.
   */
  sessionTemplateId?: Id;

  source: WorkoutSource;

  status: WorkoutStatus;

  /**
   * Date locale de la séance : YYYY-MM-DD
   */
  date: string;

  startedAt: string;
  completedAt?: string;

  /**
   * Dernière vraie interaction utilisateur.
   * Sert notamment à la reprise après interruption.
   */
  lastActionAt: string;

  /**
   * Durée réellement active.
   */
  activeDurationSec: number;

  /**
   * Snapshot ordonné des briques au démarrage,
   * enrichi ensuite par les ajouts éventuels.
   */
  blocks: PerformedBlock[];

  currentBlockId?: Id;
  currentEntryId?: Id;

  activeRest?: ActiveRest;

  createdAt: string;
  updatedAt: string;
}

export type PerformedBlock =
  | PerformedExerciseBlock
  | PerformedGroupBlock
  | PerformedNoteBlock;

export interface PerformedBaseBlock {
  id: Id;

  /**
   * Identifiant de la brique du modèle d'origine.
   * Absent si ajoutée pendant la séance.
   */
  sourceBlockId?: Id;

  position: number;

  addedDuringWorkout: boolean;
}

/* -------------------------------------------------------------------------- */
/* Exercice autonome                                                          */
/* -------------------------------------------------------------------------- */

export interface PerformedExerciseBlock extends PerformedBaseBlock {
  kind: "exercise";

  /**
   * Exercice réellement utilisé pour cette brique.
   */
  exerciseId: Id;

  /**
   * Exercice prévu initialement si substitution.
   *
   * Pour un exercice autonome, la substitution est autorisée
   * uniquement tant qu'aucune série n'a été validée.
   *
   * Une fois l'exécution commencée, changer d'exercice
   * implique d'ajouter une nouvelle brique à la séance.
   *
   * Les substitutions en cours d'exécution tour par tour
   * sont réservées aux groupes.
   */
  originalExerciseId?: Id;

  status: PerformedBlockStatus;

  /**
   * Seules les consignes sont figées au démarrage.
   */
  snapshotInstructions: ExerciseInstructions;

  series?: PerformedSeries[];

  /**
   * Utilisé pour les exercices en mode paliers :
   * - durée + vitesse + pente
   * - durée + distance
   */
  cardioSteps?: PerformedCardioStep[];

  /**
   * Utilisé pour les mesures simples :
   * - durée + distance
   * - distance seule
   */
  simpleMeasurement?: PerformedSimpleMeasurement;

  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Groupe                                                                     */
/* -------------------------------------------------------------------------- */

export interface PerformedGroupBlock extends PerformedBaseBlock {
  kind: "group";

  status: PerformedBlockStatus;

  name?: string;
  description?: string;

  plannedRounds: number;
  plannedRestBetweenRoundsSec: number;

  children: PerformedGroupChild[];

  /**
   * Réalisation organisée par tour.
   *
   * Chaque tour conserve l'exercice réellement effectué.
   * Cela permet plusieurs substitutions successives sans
   * réécrire les tours terminés.
   */
  rounds: PerformedGroupRound[];

  note?: string;
}

export interface PerformedGroupChild {
  id: Id;

  sourceChildId?: Id;

  position: number;

  /**
   * Exercice prévu par la brique au démarrage.
   *
   * L'exercice réellement effectué se trouve ensuite
   * dans chaque PerformedGroupRoundChild.
   */
  exerciseId: Id;

  snapshotInstructions: GroupChildInstructions;

  snapshotRestBeforeSec?: number;

  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Note                                                                       */
/* -------------------------------------------------------------------------- */

export interface PerformedNoteBlock extends PerformedBaseBlock {
  kind: "note";

  title?: string;
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Valeurs par côté                                                           */
/* -------------------------------------------------------------------------- */

export type BodySide =
  | "left"
  | "right";

export interface PerformedSideValue {
  side: BodySide;

  /**
   * Une seule de ces deux valeurs sera utilisée
   * selon le type de mesure de l'exercice.
   */
  reps?: number;
  durationSec?: number;
}

/* -------------------------------------------------------------------------- */
/* Séries                                                                     */
/* -------------------------------------------------------------------------- */

export interface PerformedSeries {
  id: Id;

  position: number;

  status: "upcoming" | "active" | "completed";

  load?: Load;
  reps?: number;
  durationSec?: number;

  /**
   * Pour durée/côté ou reps/côté.
   */
  sideValues?: PerformedSideValue[];

  /**
   * Effort réellement relevé.
   * Jamais prérempli.
   */
  rpe?: number;

  note?: string;

  /**
   * Repos réel après cette série.
   */
  actualRestAfterSec?: number;

  completedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Cardio par paliers                                                         */
/* -------------------------------------------------------------------------- */

export interface SpeedInclineStepSettings {
  durationSec: number;
  speedKmh: number;
  inclinePercent: number;
}

export interface DistanceStepSettings {
  durationSec: number;
  distanceKm: number;
}

export type CardioStepSettings =
  | SpeedInclineStepSettings
  | DistanceStepSettings;

export interface PerformedCardioStep {
  id: Id;

  position: number;

  status: "upcoming" | "active" | "completed";

  /**
   * Valeurs qui font foi au moment de l'exécution.
   *
   * Selon l'exercice :
   * - durée + vitesse + pente
   * - durée + distance
   */
  settings: CardioStepSettings;

  /**
   * Présent seulement si le palier a été adapté
   * avant son exécution.
   */
  originalSettings?: CardioStepSettings;

  /**
   * Relevé facultatif de fin de palier.
   * Jamais remplacé par zéro.
   */
  bpm?: number;

  note?: string;

  completedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Mesure simple                                                              */
/* -------------------------------------------------------------------------- */

export interface PerformedSimpleMeasurement {
  durationSec?: number;
  distanceKm?: number;

  /**
   * Possible pour durée + distance.
   */
  bpm?: number;

  note?: string;

  completedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Tours de groupe                                                            */
/* -------------------------------------------------------------------------- */

export interface PerformedGroupRound {
  id: Id;

  roundNumber: number;

  status: "upcoming" | "active" | "completed";

  children: PerformedGroupRoundChild[];

  /**
   * Repos réel après la fin de ce tour.
   */
  actualRestAfterSec?: number;

  completedAt?: string;
}

export interface PerformedGroupRoundChild {
  id: Id;

  groupChildId: Id;

  /**
   * Exercice réellement effectué pendant CE tour.
   *
   * C'est cette référence qui permet :
   * - remplacement à partir du tour N
   * - nouveau remplacement plus tard
   * - retour à l'exercice d'origine
   * - attribution correcte de la progression
   */
  exerciseId: Id;

  load?: Load;
  reps?: number;
  durationSec?: number;

  /**
   * Pour durée/côté ou reps/côté.
   */
  sideValues?: PerformedSideValue[];

  rpe?: number;

  note?: string;

  /**
   * Repos exceptionnel avant cet enfant,
   * s'il a réellement eu lieu.
   */
  actualRestBeforeSec?: number;

  completedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Repos                                                                      */
/* -------------------------------------------------------------------------- */

export type RestKind =
  | "between_sets"
  | "between_rounds"
  | "before_group_child";

export interface ActiveRest {
  id: Id;

  kind: RestKind;

  /**
   * Heure cible ISO.
   *
   * Le chrono n'est jamais implémenté
   * par décrément JavaScript.
   */
  targetEndAt: string;

  plannedDurationSec: number;

  startedAt: string;

  /**
   * Vrai si l'application revient après
   * expiration du repos.
   */
  expiredWhileInactive?: boolean;
}


