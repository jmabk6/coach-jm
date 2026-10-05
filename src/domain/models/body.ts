import type { Id } from "./exercise";
import type { WeightEntry } from "./weight";

/**
 * Corps (module Corps + Alimentation, phase 1, 05/10/2026, option C).
 *
 * `bodyMeasurements` est la **seule** source de toute composition
 * corporelle. Chaque mesure dit sa provenance :
 * - `device` : l'appareil, texte libre (« renpho », « withings »,
 *   « unknown », ou une future balance) — aucune liste figée ;
 * - `source` : saisie, import, ou copie d'une pesée ;
 * - `weightReference` : éligible comme poids de référence du jour, fixé à
 *   l'enregistrement d'après l'appareil de référence du moment
 *   (`weightReferenceEligible`) et stocké — changer de balance plus tard
 *   ne réécrit pas l'histoire et ne touche pas au moteur.
 * Aujourd'hui : RENPHO = référence ; Withings (historique) et autres = non.
 *
 * Relation avec `weightEntries` (seule source de poids des moteurs
 * sportifs) : la **première mesure éligible** d'un jour est la référence ;
 * elle synchronise la pesée du jour (`WeightEntry.bodyMeasurementId`), qui
 * ne porte alors **aucune** composition. Une pesée manuelle remplacée est
 * gardée intégralement (`originWeightEntry`) et revient si plus aucune
 * mesure éligible ne reste ce jour-là. Règles : `bodyWeightRules`.
 *
 * Ce sont des **estimations de la balance**, à lire comme des tendances,
 * jamais avec une précision médicale.
 */

/** Appareil de la mesure : texte libre ; voir `KNOWN_BODY_DEVICES`. */
export type BodyDevice = string;

/** Appareils connus au 05/10/2026 ; « unknown » : pesée d'origine sans composition. */
export const KNOWN_BODY_DEVICES = { renpho: "renpho", withings: "withings", unknown: "unknown" } as const;

/**
 * Saisie manuelle (V1) ; import CSV (prévu, pas encore codé) ; copie d'une
 * pesée (`weight_entry` : pesée manuelle remplacée, ou composition Withings
 * migrée des pesées).
 */
export type BodyMeasurementSource = "manual" | "csv_import" | "weight_entry";

export type BodySegmentKey = "leftArm" | "rightArm" | "trunk" | "leftLeg" | "rightLeg";

/** Analyse segmentaire : grandeurs facultatives, telles que la balance les donne. */
export interface BodySegment {
  fatKg?: number;
  fatPct?: number;
  muscleKg?: number;
  /** Indice ou pourcentage de muscle du segment, quand la balance le donne. */
  musclePct?: number;
}

export interface BodyMeasurement {
  id: Id;
  /** Jour local de la mesure : YYYY-MM-DD. */
  date: string;
  /** Heure de prise (ISO) : départage les mesures d'un même jour. */
  takenAt: string;
  device: BodyDevice;
  source: BodyMeasurementSource;
  /** Éligible comme poids de référence du jour (fixé à l'enregistrement). */
  weightReference: boolean;

  weightKg: number;
  bmi?: number;
  fatKg?: number;
  fatPct?: number;
  fatFreeKg?: number;
  muscleKg?: number;
  skeletalMuscleKg?: number;
  waterKg?: number;
  boneKg?: number;
  proteinKg?: number;
  visceralFat?: number;
  bmrKcal?: number;
  metabolicAge?: number;
  /** Score corporel de la balance (RENPHO : sur 100). */
  score?: number;

  segments?: Partial<Record<BodySegmentKey, BodySegment>>;
  /** Tout autre champ de la balance, conservé tel quel (import CSV futur). */
  extra?: Record<string, number | string>;
  /** Référence de la ligne importée (CSV), pour ne jamais importer deux fois. */
  importRef?: string;
  /** Copie d'une pesée : son identifiant. */
  originWeightEntryId?: string;
  /** Pesée manuelle remplacée par une mesure de référence : son état exact, pour la rendre telle quelle. */
  originWeightEntry?: WeightEntry;
  note?: string;

  createdAt: string;
  updatedAt: string;
}

/** Une plage de cible : un minimum, un maximum, ou les deux. */
export interface BodyTargetRange {
  min?: number;
  max?: number;
}

/**
 * Cible personnelle indicative de composition corporelle (phase 2.1,
 * 05/10/2026) : jamais une norme médicale. Réglable dans l'application ;
 * indépendante de l'objectif Poids et du pari traction V6.
 */
export interface BodyCompositionTargets {
  weightKg: BodyTargetRange;
  fatPct: BodyTargetRange;
  fatKg: BodyTargetRange;
  skeletalMuscleKg: BodyTargetRange;
  updatedAt: string;
}
