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

/**
 * Nature réelle d'une séance faite (conception technique v1.5, § 2.2).
 * Absent = `"training"` : toutes les séances antérieures au schéma v2
 * sont des séances d'entraînement et conservent leur traitement
 * statistique. Posé au démarrage, jamais modifié après la clôture.
 */
export type WorkoutKind =
  | "training"
  | "mobility_assessment";

/**
 * Rôle d'une série (v1.5, § 4.4), saisi explicitement, jamais dérivé du
 * RPE ni de la charge. Absent = série de travail.
 */
export type PerformedSeriesRole =
  | "echauffement"
  | "travail";

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

  /**
   * Nature réelle de la séance (v1.5, § 2.2). Absent = entraînement.
   * C'est ce champ, et non la catégorie du modèle, qui décide du
   * traitement d'une séance faite dans les statistiques.
   */
  kind?: WorkoutKind;

  /**
   * Échelle de RPE en vigueur au démarrage (v1.5, § 4.5). Absent sur les
   * séances antérieures à la première version de l'échelle : leur RPE est
   * conservé tel quel, sans conversion.
   */
  rpeScaleVersionId?: Id;

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
   * Durée active (§12) : amplitude du démarrage à la fin, moins les
   * pauses explicites. Recalculée à chaque sauvegarde, figée à la clôture.
   * Une absence de l'application n'en retire rien (§15).
   */
  activeDurationSec: number;

  /**
   * Pauses explicites (§15), dans l'ordre. Une pause sans `endedAt`
   * est la pause en cours ; elle survit à la fermeture de l'app.
   * Absent sur les séances antérieures à la v2.9 : aucune pause.
   */
  pauses?: WorkoutPause[];

  /**
   * Dernière présence enregistrée de l'application (battement pendant
   * qu'elle est visible, écriture à la mise en arrière-plan). Ne sert
   * qu'à mesurer une absence au retour (§15) — jamais aux chronos.
   */
  lastSeenAt?: string;

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
   * Version de cadre de l'exercice réellement effectué, capturée au
   * démarrage, à l'ajout ou à la substitution (v1.5, § 4.3). Absent =
   * exercice sans cadre au moment de l'exécution : aucune validation.
   */
  frameVersionId?: Id;

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
  distanceCm?: number;
}

/* -------------------------------------------------------------------------- */
/* Statut d'une entrée : série, palier, tour                                  */
/* -------------------------------------------------------------------------- */

/**
 * `upcoming` et `active` n'existent que pendant la séance. À la clôture,
 * toute entrée non validée devient `not_performed` : trois mois plus
 * tard, on doit lire qu'elle n'a pas été faite, pas qu'elle était
 * encore prévue.
 */
export type PerformedEntryStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "not_performed";

/* -------------------------------------------------------------------------- */
/* Séries                                                                     */
/* -------------------------------------------------------------------------- */

export interface PerformedSeries {
  id: Id;

  position: number;

  status: PerformedEntryStatus;

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

  /**
   * Rôle de la série (v1.5, § 4.4). Absent = travail.
   */
  role?: PerformedSeriesRole;

  /**
   * Série limitée par un côté (v1.5, § 4.4) : empêche la validation du
   * cadre. Absent = faux.
   */
  sideLimited?: boolean;

  note?: string;

  /**
   * Repos réel après cette série : fin réelle − début (§12).
   */
  actualRestAfterSec?: number;

  /**
   * Faux si ce repos a été clôturé par la fin de séance ou chevauché
   * par une pause : enregistré, lisible, mais hors repos moyen.
   */
  restComparable?: boolean;

  /**
   * Ajustements `−30 s` / `+30 s` appliqués pendant ce repos.
   */
  restAdjustmentSec?: number;

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

  status: PerformedEntryStatus;

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
   * Mesure physique en centimètres.
   * Peut être négative si le protocole autorise
   * un dépassement du point zéro.
   */
  distanceCm?: number;

  /**
   * Mesures en centimètres par côté.
   */
  sideValues?: PerformedSideValue[];


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

  status: PerformedEntryStatus;

  children: PerformedGroupRoundChild[];

  /**
   * Repos réel après la fin de ce tour.
   */
  actualRestAfterSec?: number;

  /**
   * Voir PerformedSeries.restComparable.
   */
  restComparable?: boolean;

  restAdjustmentSec?: number;

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

  /**
   * Version de cadre de l'exercice de CE tour (v1.5, § 4.3) : elle suit
   * l'exercice réellement effectué, jamais `PerformedGroupChild`.
   */
  frameVersionId?: Id;

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
/* Pauses                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Suspension explicite de la séance (§15). Seule chose retirée de la
 * durée active ; rien n'est supprimé, aucun repos n'est relancé.
 */
export interface WorkoutPause {
  id: Id;
  startedAt: string;
  endedAt?: string;
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
   * Heure de fin cible ISO : la fin du compte à rebours (§12).
   * Le chrono n'est jamais implémenté par décrément JavaScript ;
   * le repos suit l'horloge réelle, app ouverte ou non.
   *
   * La fin réelle est un autre instant : la validation suivante,
   * `Passer`, ou la clôture de la séance.
   */
  targetEndAt: string;

  plannedDurationSec: number;

  startedAt: string;

  /**
   * Brique et entrée (série, tour, enfant de tour) auxquelles le repos
   * réel sera rattaché à sa fin.
   */
  afterBlockId: Id;
  afterEntryId: Id;

  /**
   * Une pause explicite a chevauché ce repos : il reste terminé à son
   * heure cible mais n'est pas comparable (§12).
   */
  overlappedPauseId?: Id;

  /**
   * Somme des `−30 s` / `+30 s` appliqués à ce repos, en secondes.
   * La durée prévue reste celle du snapshot ; l'ajustement est
   * enregistré à part.
   */
  adjustmentSec?: number;
}


