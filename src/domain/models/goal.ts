import type { Id } from "./exercise";

/* -------------------------------------------------------------------------- */
/* Objectif V2 (conception V2 § 3.6) — store `goals` refondu en v3             */
/* -------------------------------------------------------------------------- */

export type GoalKey =
  | "traction"
  | "upper_body"
  | "legs"
  | "cardio"
  | "core"
  | "flexibility"
  | "weight";

/** Hausse = mieux (`increase`) ou baisse = mieux (`decrease`). */
export type GoalDirection = "increase" | "decrease";

export type GoalMeasure =
  | { source: "test"; protocolId: Id; measureKey: string }
  | { source: "weight_weekly_average" };

/**
 * Un segment d'objectif (correction A) : seul le segment `final` fait
 * réussir l'objectif ; atteindre un segment intermédiaire affiche
 * « Palier atteint ». Les segments ne sont jamais raccordés sur la courbe.
 */
export interface GoalSegment {
  id: Id;
  role: "intermediate" | "final";
  /** Absent = « — » (Jambes avant son choix d'indicateur). */
  measure?: GoalMeasure;
  direction?: GoalDirection;
  target?: number;
  dueDate?: string;
  label: string;
}

export type GoalSecondaryIndicator =
  | { kind: "exercise"; exerciseId: Id; metric: "chargeMax" | "reps" | "durationMax" | "volume" | "powerMax" }
  | { kind: "test_measure"; protocolId: Id; measureKey: string };

/**
 * Rien de dérivé n'est stocké — ni départ, ni statut, ni atteinte : tout
 * se recalcule à l'affichage, suppression de séance comprise.
 */
export interface Goal {
  id: Id;
  /** Unique (index `&key`). */
  key: GoalKey;
  position: number;
  title: string;
  /** Nom d'icône Lucide (D4). */
  icon: string;
  segments: GoalSegment[];
  currentSegmentId: Id;
  /** Repli si le segment courant n'a pas d'échéance. */
  dueDate?: string;
  linkedExercises: Array<{ exerciseId: Id }>;
  secondaryIndicators: GoalSecondaryIndicator[];
  adviceKey: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Forme v1, jamais écrite par l'application                                   */
/* -------------------------------------------------------------------------- */

/**
 * Métriques de la progression par exercice, héritées de la forme v1 ;
 * encore lues par `workoutRules.isMetricCompatible`.
 */
export type ExerciseGoalMetric =
  | "max_load"
  | "volume"
  | "reps"
  | "max_duration";

/**
 * Objectif sous la forme des schémas v1 et v2 (cible unique). Aucun code
 * ne l'a jamais écrit ; la migration v3 refuse une base qui en contient
 * (SCHEMA_DEXIE_V3_MIGRATION § 4.2). Gardé pour les tests de migration et
 * la lecture d'anciennes sauvegardes ; retiré au lot N.
 */
export interface LegacyGoalV1 {
  id: Id;
  name: string;
  target:
    | { kind: "exercise"; exerciseId: Id; metric: ExerciseGoalMetric; targetValue: number }
    | { kind: "cardio_bpm"; exerciseId: Id; durationSec: number; speedKmh: number; inclinePercent: number; targetBpm: number }
    | { kind: "weight"; targetKg: number; direction: "lose" | "gain" };
  status: "active" | "achieved";
  dueDate?: string;
  note?: string;
  achievedAt?: string;
  createdAt: string;
  updatedAt: string;
}
