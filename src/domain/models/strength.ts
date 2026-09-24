import type { Id } from "./exercise";

/**
 * Module Musculation (conception technique v1.6, § 4).
 */

/* -------------------------------------------------------------------------- */
/* Cadres                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Identité stable d'un cadre : un cadre par exercice suivi (§ 4.1).
 */
export interface StrengthFrame {
  id: Id;
  exerciseId: Id;
  activeVersionId: Id;
  createdAt: string;
  updatedAt: string;
}

export type StrengthFrameVersionStatus =
  | "active"
  | "archived";

export type StrengthProgressionType =
  | "charge_croissante"
  | "assistance_decroissante"
  | "duree_croissante";

export type StrengthArchiveReason =
  | "plafond_atteint"
  | "erreur_calibration"
  | "changement_materiel";

export type StrengthUnit =
  | "kg"
  | "sec";

export interface StrengthCurrentTarget {
  value: number;
  unit: StrengthUnit;
  /** ISO, date du choix. */
  acceptedAt: string;
  /** Jalon à l'origine de la hausse acceptée ; absent pour une charge de départ. */
  fromMilestoneId?: Id;
}

/**
 * Version d'un cadre (§ 4.2). La charge n'en fait pas partie : elle se
 * déduit des séries. Tant que `firstOfficialWorkoutId` est absent, les
 * paramètres sont modifiables sans créer de version.
 */
export interface StrengthFrameVersion {
  id: Id;
  frameId: Id;
  number: number;
  status: StrengthFrameVersionStatus;
  progressionType: StrengthProgressionType;
  workSets: number;
  /** Hors `duree_croissante`. */
  repRange?: { min: number; max: number };
  /** `duree_croissante` uniquement. */
  targetDurationSec?: number;
  /** Facultatif sur `duree_croissante`. */
  rpeTarget?: number;
  restSec: number;
  /**
   * Cran de progression (lot D.6, D18) : facultatif. Absent — traction
   * assistée tant que le cran de la machine n'est pas saisi —, aucune
   * hausse n'est proposée. Le renseigner plus tard ne crée pas de
   * version (N4) : ce n'est pas un paramètre figé.
   */
  increment?: { unit: StrengthUnit; value: number };
  /**
   * Poids de la barre pour une saisie par côté (v1.6, décision 4). Aide
   * à la saisie, hors figeage : les séries gardent leur propre `tareKg`.
   */
  barWeightKg?: number;
  /**
   * Objectif en cours (v1.6, décision 12) : la charge ou la durée à
   * travailler à la prochaine séance, choix daté de l'utilisateur. Posé
   * à la confirmation d'une charge de départ ou à l'acceptation d'une
   * hausse ; effacé à tout nouveau jalon, à la suppression de la séance
   * du jalon d'origine et à l'archivage. Hors figeage (§ 4.2 bis).
   */
  currentTarget?: StrengthCurrentTarget;
  /** Figeage : première séance officielle terminée sous cette version. */
  firstOfficialWorkoutId?: Id;
  frozenAt?: string;
  archivedAt?: string;
  archiveReason?: StrengthArchiveReason;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Jalons                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Un jalon par validation, créé à la fin d'une séance, jamais
 * rétroactivement, jamais depuis une séance importée (§ 4.3). Seule
 * source de la courbe.
 */
export interface StrengthMilestone {
  id: Id;
  frameVersionId: Id;
  workoutId: Id;
  /** Date locale YYYY-MM-DD. */
  date: string;
  value: number;
  unit: StrengthUnit;
  /** Plafond du protocole atteint (type assistance). */
  ceilingReached?: boolean;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Échelle de RPE                                                             */
/* -------------------------------------------------------------------------- */

export type RpeScaleVersionStatus =
  | "active"
  | "archived";

/**
 * Échelle de RPE versionnée (§ 4.5). Les séances antérieures à
 * `startDate` n'ont pas de `rpeScaleVersionId` : leur RPE est conservé
 * tel quel, sans conversion.
 */
export interface RpeScaleVersion {
  id: Id;
  number: number;
  status: RpeScaleVersionStatus;
  table: Array<{ rpe: number; repsInReserveLabel: string }>;
  /** Date locale YYYY-MM-DD. */
  startDate: string;
  createdAt: string;
}
