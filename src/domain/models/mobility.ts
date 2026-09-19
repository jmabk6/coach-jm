import type { Id } from "./exercise";

/**
 * Module Mobilité (conception technique v1.5, § 6). Un bilan est une
 * séance `kind: "mobility_assessment"` ; les mesures restent dans les
 * `PerformedBlock` de cette séance, seule source de vérité. Types seuls.
 */

export type MobilityProtocolVersionStatus =
  | "active"
  | "archived";

export type MobilityMeasurementState =
  | "a_froid"
  | "apres_echauffement";

/**
 * Version du protocole de bilan (§ 6.2). Changer l'un des quatre
 * paramètres — état, position, méthode, consigne d'arrêt — crée une
 * version ; les mesures de deux versions ne se comparent pas.
 */
export interface MobilityProtocolVersion {
  id: Id;
  number: number;
  status: MobilityProtocolVersionStatus;
  measurementState: MobilityMeasurementState;
  /** Par clé de test. */
  positionSpec: Record<string, string>;
  methodSpec: Record<string, string>;
  stopCriterion: string;
  /** Test chevilles. */
  approachStepCm?: number;
  /** Date locale YYYY-MM-DD. */
  startDate: string;
  createdAt: string;
}

/**
 * Un bilan par séance de bilan (§ 6.3) : le regroupement des trois tests.
 */
export interface MobilityAssessment {
  id: Id;
  /** Unique : une séance porte au plus un bilan. */
  workoutId: Id;
  versionId: Id;
  /** Date locale YYYY-MM-DD. */
  date: string;
  note?: string;
  createdAt: string;
}

export type MobilityMeasureKey =
  | "jambes_doigts_orteils"
  | "cheville_orteil_mur"
  | "epaules_ecart_doigts";

export type MobilityMeasureSide =
  | "gauche"
  | "droite"
  | "position_1"
  | "position_2";

/**
 * Référence vers la valeur mesurée, qui reste dans le `PerformedBlock`
 * de la séance (`simpleMeasurement.distanceCm` ou l'un des deux côtés).
 */
export interface MobilityMeasureRef {
  blockId: Id;
  field: "distanceCm" | "left" | "right";
}

/**
 * Mesure d'un bilan (§ 6.4). **Aucune valeur n'est stockée ici** :
 * référence, conformité et note seulement.
 */
export interface MobilityMeasure {
  id: Id;
  assessmentId: Id;
  key: MobilityMeasureKey;
  side?: MobilityMeasureSide;
  conforme: boolean;
  raisonNonConformite?: string;
  measureRef: MobilityMeasureRef;
  note?: string;
}

export type MobilityObservationZone =
  | "hanches"
  | "dos"
  | "autre";

export type MobilityFeeling =
  | "confortable"
  | "limite"
  | "douloureux";

/**
 * Observation qualitative d'un bilan (§ 6.5). Liste de zones fermée,
 * pas d'échelle numérique.
 */
export interface MobilityObservation {
  id: Id;
  assessmentId: Id;
  zone: MobilityObservationZone;
  ressenti: MobilityFeeling;
  note?: string;
}
