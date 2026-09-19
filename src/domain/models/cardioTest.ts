import type { Id } from "./exercise";

/**
 * Module Cardio (conception technique v1.5, § 5). Un test cardio n'est
 * pas une séance : ces stores sont indépendants de `workouts`, ses
 * paliers ne sont pas des `PerformedCardioStep` (§ 5.5). Types seuls.
 */

export type CardioIndicator =
  | "fc_effort"
  | "vitesse_plafond"
  | "derive"
  | "recuperation";

export type CardioCycleWeek = 1 | 2 | 3 | 4;

/**
 * Quatre protocoles, créés par un seed dédié (§ 5.1).
 */
export interface CardioProtocol {
  id: Id;
  name: string;
  indicator: CardioIndicator;
  cycleWeek: CardioCycleWeek;
  activeVersionId: Id;
  createdAt: string;
  updatedAt: string;
}

export type CardioProtocolVersionStatus =
  | "a_calibrer"
  | "validee"
  | "archivee";

export interface CardioSequenceStep {
  order: number;
  label: string;
  durationSec?: number;
  speedKmh?: number;
  inclinePercent?: number;
}

export interface CardioMeasureSpec {
  key: string;
  unit: string;
  windowStartSec?: number;
  windowEndSec?: number;
}

/**
 * Version d'un protocole (§ 5.2). Une version ne quitte `a_calibrer`
 * que lorsque tous les `parameters` sont non nuls ; tant qu'elle est à
 * calibrer, elle ne peut produire aucun résultat officiel.
 */
export interface CardioProtocolVersion {
  id: Id;
  protocolId: Id;
  number: number;
  status: CardioProtocolVersionStatus;
  sequence: CardioSequenceStep[];
  referenceStepOrder?: number;
  /** `null` = à calibrer. */
  parameters: Record<string, number | null>;
  stopCriterion: string;
  measureSpec: CardioMeasureSpec[];
  /** Définition de la complétude d'un test. */
  requiredMeasureKeys: string[];
  ceilingRule?: string;
  firstOfficialTestId?: Id;
  frozenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CardioTestStatus =
  | "complet"
  | "incomplet"
  | "essai_a_blanc";

export type CardioTestEndReason =
  | "critere_atteint"
  | "arret_volontaire"
  | "incident";

/**
 * Passation d'un protocole (§ 5.3). Complétude (`status`), conformité
 * (`conditionsRespected`) et admissibilité (dérivée) sont trois notions
 * distinctes (§ 5.3 bis). `result` est un dérivé stocké, calculé une
 * fois à la clôture.
 */
export interface CardioTest {
  id: Id;
  versionId: Id;
  /** Date locale YYYY-MM-DD. */
  date: string;
  /** Heure locale HH:MM. */
  time: string;
  status: CardioTestStatus;
  endReason: CardioTestEndReason;
  result?: number;
  ceilingReached?: boolean;
  conditionsRespected: boolean;
  conditionsDeviation?: string;
  rpe?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mesure relevée pendant un test (§ 5.4).
 */
export interface CardioTestMeasure {
  id: Id;
  testId: Id;
  key: string;
  value: number;
  unit: string;
  windowStartSec?: number;
  windowEndSec?: number;
}
