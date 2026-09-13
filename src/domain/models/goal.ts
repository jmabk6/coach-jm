import type { Id } from "./exercise";

export type GoalStatus =
  | "active"
  | "achieved";

/**
 * Métriques existantes de la progression par exercice.
 *
 * Leur compatibilité dépend du type de mesure
 * de l'exercice référencé.
 */
export type ExerciseGoalMetric =
  | "max_load"
  | "volume"
  | "reps"
  | "max_duration";

export interface ExerciseGoalTarget {
  kind: "exercise";

  exerciseId: Id;

  metric: ExerciseGoalMetric;

  /**
   * La cible porte la même unité que la métrique.
   */
  targetValue: number;
}

/**
 * Objectif BPM sur un palier de cardio comparable.
 *
 * Les trois réglages définissent l'effort de référence.
 * La durée est comparée avec la tolérance prévue
 * par les règles des paliers comparables.
 */
export interface CardioBpmGoalTarget {
  kind: "cardio_bpm";

  exerciseId: Id;

  durationSec: number;
  speedKmh: number;
  inclinePercent: number;

  /**
   * Exemple : <= 120 bpm.
   */
  targetBpm: number;
}

/**
 * Objectif de poids.
 *
 * Le sens est fixé une seule fois lors de la création :
 * - automatiquement depuis la dernière pesée si elle existe ;
 * - demandé à l'utilisateur s'il n'existe encore aucune pesée.
 */
export interface WeightGoalTarget {
  kind: "weight";

  targetKg: number;

  direction: "lose" | "gain";
}

export type GoalTarget =
  | ExerciseGoalTarget
  | CardioBpmGoalTarget
  | WeightGoalTarget;

export interface Goal {
  id: Id;

  name: string;

  target: GoalTarget;

  status: GoalStatus;

  /**
   * Date facultative YYYY-MM-DD.
   *
   * Une échéance dépassée reste une information neutre.
   */
  dueDate?: string;

  note?: string;

  /**
   * Date de la première réalisation ayant atteint la cible.
   *
   * Cette valeur peut être recalculée après correction
   * ou suppression rétroactive d'une donnée source.
   */
  achievedAt?: string;

  createdAt: string;
  updatedAt: string;
}
