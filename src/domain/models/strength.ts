import type { Id } from "./exercise";

/**
 * Module Musculation (conception technique v1.5, § 4). Types seuls :
 * aucune règle, aucun repository, aucun écran dans le lot 1.
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
  increment: { unit: StrengthUnit; value: number };
  /** Figeage : première séance officielle validée sous cette version. */
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
