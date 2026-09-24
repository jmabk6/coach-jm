import type { Id } from "./exercise";

/**
 * Tests (conception V2 § 3.7, SCHEMA_DEXIE_V3_MIGRATION § 2.2) : un
 * protocole stable, des versions figées dès le premier résultat officiel,
 * des résultats datés à plusieurs mesures. `testResults` est la source
 * unique des mesures de test (D27) : une séance ne garde qu'une référence.
 *
 * Types seuls au lot C ; repositories, seed et écrans au lot G.
 */

export type TestProtocolStatus =
  | "active"
  | "paused";

export interface TestProtocol {
  id: Id;
  /** traction, traction_stricte, cardio, jambes, souplesse, mensurations, tronc — unique. */
  key: string;
  name: string;
  status: TestProtocolStatus;
  activeVersionId: Id;
  createdAt: string;
  updatedAt: string;
}

export type TestProtocolKind =
  | "trials_descending"
  | "single_attempt"
  | "measures";

export interface TestMeasureSpec {
  key: string;
  label: string;
  unit: string;
  /** `derived` : calculée à l'enregistrement (ratio, moyenne, baisse). */
  input: "entered" | "derived";
  /** Complétude : un résultat est `complete` quand toutes les mesures requises y sont. */
  required: boolean;
  /** Mesure par côté (gauche / droite). */
  side?: boolean;
  /** Accepte les valeurs négatives (doigts-sol, D8). */
  signed?: boolean;
  /** Exercice du catalogue qui illustre la mesure. */
  exerciseId?: Id;
}

export interface TestProtocolVersion {
  id: Id;
  protocolId: Id;
  number: number;
  status: "active" | "archived";
  kind: TestProtocolKind;
  instructions: string[];
  settings?: Record<string, number | string>;
  measures: TestMeasureSpec[];
  primaryMeasureKey?: string;
  /** Figeage : dès le premier résultat officiel, toute modification crée une version. */
  firstOfficialResultId?: Id;
  frozenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestTrial {
  order: number;
  value: number;
  outcome: "success" | "failure";
  /**
   * Essai fait au réglage le plus bas de la machine : réussi, il termine
   * le test sans échec (décision du 24/09/2026).
   */
  atLowestSetting?: true;
  restSec?: number;
  completedAt: string;
}

export interface TestMeasureValue {
  key: string;
  value: number;
  unit: string;
  side?: "left" | "right";
}

export interface TestResult {
  id: Id;
  protocolId: Id;
  versionId: Id;
  /** Date du test, YYYY-MM-DD (saisie d'un test passé possible). */
  date: string;
  origin: "workout" | "manual";
  workoutId?: Id;
  blockId?: Id;
  status: "complete" | "incomplete";
  /** Mesures entrées et dérivées, calculées une fois à l'enregistrement. */
  measures: TestMeasureValue[];
  trials?: TestTrial[];
  conditionsRespected?: boolean;
  conditionsNote?: string;
  rpe?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Test attaché à une séance planifiée d'une semaine de tests (§ 3.5.1),
 * recopié depuis `settings.testSchedule` à la génération.
 */
export interface PlannedTest {
  protocolId: Id;
  placement: "before_all" | "after_warmup" | "replace_block" | "replace_all";
  targetBlockId?: Id;
  adjustments?: Array<{ blockId: Id; sets: number }>;
  /** D26 : posé par « Replanifier ». */
  rescheduledToPlannedSessionId?: Id;
}

/**
 * Brique de test d'une séance (§ 3.5.2), dans l'union `PerformedBlock`
 * depuis le lot G.3. Insérée au démarrage selon son placement ; jamais
 * ajoutée en cours de séance.
 */
export interface PerformedTestBlock {
  kind: "test";
  id: Id;
  position: number;
  addedDuringWorkout: false;
  status: "performed" | "skipped" | "not_performed";
  protocolId: Id;
  protocolVersionId: Id;
  replacedBlockId?: Id;
  /** Saisie pendant l'exécution ; retirée à la confirmation (D27). */
  draft?: {
    trials?: TestTrial[];
    values?: Record<string, number>;
    sideValues?: Record<string, { left?: number; right?: number }>;
    note?: string;
  };
  /** Posé à la confirmation : la seule trace du test dans la séance. */
  testResultId?: Id;
}
