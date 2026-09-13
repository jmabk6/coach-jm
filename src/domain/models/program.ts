import type { Id } from "./exercise";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface WeeklyProgram {
  id: Id;

  name: string;

  days: WeeklyProgramDay[];

  createdAt: string;
  updatedAt: string;
}

export interface WeeklyProgramDay {
  weekday: Weekday;

  /**
   * Un seul modèle par jour, ou aucun.
   */
  sessionTemplateId?: Id;
}

/**
 * Les quatre statuts visibles du Programme.
 *
 * "Retirée" n'est volontairement pas un statut :
 * une occurrence retirée disparaît de l'interface.
 */
export type PlannedSessionStatus =
  | "upcoming"
  | "in_progress"
  | "done"
  | "skipped";

export interface PlannedSession {
  id: Id;

  /**
   * Date locale ISO : YYYY-MM-DD
   */
  date: string;

  sessionTemplateId: Id;

  status: PlannedSessionStatus;

  /**
   * Réalisation créée à partir de cette occurrence,
   * dès que la séance planifiée a été démarrée.
   *
   * Le lien inverse existe sur WorkoutSession
   * via plannedSessionId.
   */
  workoutId?: Id;

  /**
   * Une instance issue de la programmation
   * garde le jour de la règle qui l'a créée.
   *
   * Une modification ultérieure de cette instance
   * ne modifie jamais la règle hebdomadaire.
   */
  sourceWeekday?: Weekday;

  /**
   * Origine de l'instance.
   *
   * weekly_program :
   * générée depuis la programmation hebdomadaire.
   *
   * manual :
   * ajout ponctuel depuis le Programme.
   */
  source: "weekly_program" | "manual";

  /**
   * Marqueur technique de retrait.
   *
   * Une occurrence retirée n'est plus affichée,
   * mais reste conservée afin que la génération
   * automatique ne puisse pas la recréer.
   *
   * Ce champ n'est jamais affiché comme un statut.
   */
  removedAt?: string;

  createdAt: string;
  updatedAt: string;
}

