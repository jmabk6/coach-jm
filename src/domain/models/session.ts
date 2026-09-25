import type { Id } from "./exercise";

/** Catégorie d'un modèle ; « Bilan de mobilité » retirée au lot N (D2). */
export type SessionCategory =
  | "Musculation"
  | "Cardio"
  | "Mobilité"
  /** Routines du soir (conception V2 § 2.5, lot D). */
  | "Routine";

export type SessionStatus =
  | "active"
  | "archived";

export interface SessionTemplate {
  id: Id;

  name: string;
  category: SessionCategory;
  description?: string;

  status: SessionStatus;

  /**
   * Ordre manuel dans la liste des modèles.
   */
  position: number;

  blocks: SessionBlock[];

  /** Lettre du programme V1 (A, B, C) ; absente sur un modèle utilisateur. */
  letter?: "A" | "B" | "C";
  /** « Traction force / dos », « Endurance facile ». */
  subtitle?: string;
  /** « Haut du corps · Dos » (M2). */
  tags?: string[];
  /** Modèle installé par le seed du programme V1. */
  origin?: "program_v1";
  /** Bloc principal, remplacé par un test (Cardio A). */
  mainBlockId?: Id;

  createdAt: string;
  updatedAt: string;
}

/**
 * Il n'existe que trois types de briques.
 */
export type SessionBlock =
  | ExerciseBlock
  | GroupBlock
  | NoteBlock;

export interface BaseBlock {
  id: Id;

  /**
   * Ordre structurel dans la séance.
   * Toutes les briques comptent ici, y compris les notes.
   */
  position: number;

  /** Brique d'échauffement (D14). Absent = travail. */
  role?: "warmup";
}

export interface ExerciseBlock extends BaseBlock {
  kind: "exercise";

  /**
   * Référence vers l'exercice de la bibliothèque.
   *
   * Le mode et le type de mesure sont lus sur l'exercice.
   * Ils ne sont jamais recopiés ici.
   */
  exerciseId: Id;

  instructions: ExerciseInstructions;

  notes?: string;
}

export interface GroupBlock extends BaseBlock {
  kind: "group";

  /**
   * Nom libre.
   * L'interface affiche "Groupe N" si vide.
   */
  name?: string;

  description?: string;

  /**
   * Nombre de tours.
   */
  rounds: number;

  /**
   * Repos prévu entre deux tours.
   */
  restBetweenRoundsSec: number;

  /**
   * Minimum deux enfants.
   * Aucun groupe imbriqué.
   */
  children: GroupChild[];
}

export interface GroupChild {
  id: Id;

  position: number;

  /**
   * Référence vers l'exercice de la bibliothèque.
   */
  exerciseId: Id;

  /**
   * Le groupe absorbe :
   * - le nombre de séries
   * - le repos entre séries
   *
   * L'enfant ne conserve que ses valeurs cibles.
   */
  instructions: GroupChildInstructions;

  /**
   * Exception autorisée :
   * repos spécifique juste avant cet enfant.
   */
  restBeforeSec?: number;

  notes?: string;
}

export interface NoteBlock extends BaseBlock {
  kind: "note";

  title?: string;
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Valeurs communes                                                           */
/* -------------------------------------------------------------------------- */

export interface NumberRange {
  min: number;
  max: number;
}

/**
 * Consigne en plage (D16) : une vraie plage min/max quand la prescription
 * en est une (« pente 6-8 % », « 8-10 min ») ; une valeur unique reste
 * permise quand la prescription en est une. Le réalisé, lui, reste
 * toujours une valeur unique. Les consignes antérieures (nombres) restent
 * valides telles quelles.
 */
export type RangeOrValue = number | NumberRange;

export interface TargetRpe {
  min: number;
  max: number;
}

/**
 * Forme technique des consignes.
 *
 * Ce champ ne représente ni le mode ni le type de mesure.
 * Ceux-ci restent définis uniquement sur l'exercice.
 *
 * Plusieurs types de mesure peuvent partager la même forme
 * de saisie dans un modèle de séance.
 */
export type InstructionShape =
  | "reps"
  | "duration"
  | "steps"
  | "duration_distance"
  | "distance"
  | "distance_cm"
  | "distance_cm_per_side";

/* -------------------------------------------------------------------------- */
/* Consignes d'un exercice autonome                                           */
/* -------------------------------------------------------------------------- */

/**
 * Le mode et le type de mesure ne sont pas stockés ici.
 * Ils sont déterminés par l'exercice référencé.
 */
export type ExerciseInstructions =
  | RepsShapeInstructions
  | DurationShapeInstructions
  | StepsInstructions
  | DurationDistanceSimpleInstructions
  | DistanceInstructions
  | DistanceCmInstructions
  | DistanceCmPerSideInstructions;

/**
 * Forme utilisée pour :
 * - charge + répétitions
 * - répétitions
 * - répétitions par côté
 *
 * La charge n'est jamais une consigne du modèle.
 */
export interface RepsShapeInstructions {
  shape: "reps";

  sets: number;
  reps: NumberRange;

  targetRpe?: TargetRpe;

  restBetweenSetsSec: number;

  tempo?: string;
  technicalCue?: string;
}

/**
 * Forme utilisée pour :
 * - durée
 * - durée par côté
 */
export interface DurationShapeInstructions {
  shape: "duration";

  sets: number;
  durationSec: RangeOrValue;

  targetRpe?: TargetRpe;

  restBetweenSetsSec: number;

  technicalCue?: string;
}

/* -------------------------------------------------------------------------- */
/* Paliers                                                                    */
/* -------------------------------------------------------------------------- */

export type SessionStepInstruction =
  | SpeedInclineStepInstruction
  | DistanceStepInstruction;

export interface SpeedInclineStepInstruction {
  id: Id;

  position: number;

  durationSec: RangeOrValue;
  speedKmh: RangeOrValue;
  inclinePercent: RangeOrValue;

  /** Effort visé sur ce palier (« RPE 7-8 », Cardio B). */
  targetRpe?: NumberRange;
}

export interface DistanceStepInstruction {
  id: Id;

  position: number;

  durationSec: number;
  /**
   * Facultative (lot D.6 bis) : un palier au RPE (Cardio B, « 1 min à
   * RPE 7-8 ») n'a pas de distance prescrite. Absente, rien n'est inventé.
   */
  distanceKm?: number;

  /** Effort visé sur ce palier (« RPE 7-8 »). */
  targetRpe?: NumberRange;
}

/**
 * Utilisé si l'exercice référencé est en mode "paliers".
 *
 * Cela couvre :
 * - durée + vitesse + pente
 * - durée + distance
 */
export interface StepsInstructions {
  shape: "steps";

  steps: SessionStepInstruction[];

  technicalCue?: string;
}

/* -------------------------------------------------------------------------- */
/* Mesures simples                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Durée + distance en mode mesure simple.
 */
export interface DurationDistanceSimpleInstructions {
  shape: "duration_distance";

  durationSec?: number;
  distanceKm?: number;

  technicalCue?: string;
}

/**
 * Distance seule.
 */
export interface DistanceInstructions {
  shape: "distance";

  distanceKm?: number;

  technicalCue?: string;
}
/**
 * Mesure simple en centimètres.
 */
export interface DistanceCmInstructions {
  shape: "distance_cm";

  distanceCm?: number;

  technicalCue?: string;
}

/**
 * Mesure simple en centimètres par côté.
 */
export interface DistanceCmPerSideInstructions {
  shape: "distance_cm_per_side";

  leftCm?: number;
  rightCm?: number;

  technicalCue?: string;
}

/* -------------------------------------------------------------------------- */
/* Consignes d'un enfant de groupe                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pas de nombre de séries ici :
 * le nombre de tours appartient au groupe.
 *
 * Pas de repos entre séries ici :
 * le repos appartient au groupe.
 *
 * L'éligibilité future des différents modes à l'intérieur
 * d'un groupe reste une règle métier distincte.
 */
export type GroupChildInstructions =
  | GroupRepsShapeInstructions
  | GroupDurationShapeInstructions;

/**
 * Forme utilisée pour :
 * - charge + répétitions
 * - répétitions
 * - répétitions par côté
 */
export interface GroupRepsShapeInstructions {
  shape: "reps";

  reps: NumberRange;

  targetRpe?: TargetRpe;

  tempo?: string;
  technicalCue?: string;
}

/**
 * Forme utilisée pour :
 * - durée
 * - durée par côté
 */
export interface GroupDurationShapeInstructions {
  shape: "duration";

  durationSec: RangeOrValue;

  targetRpe?: TargetRpe;

  technicalCue?: string;
}



