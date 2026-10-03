import type { Id } from "./exercise";
import type { Weekday } from "./program";
import type { PlannedTest } from "./testProtocol";

/**
 * Réglages de l'application (conception V2 § 3.9) : un enregistrement par
 * clé, store `settings` à clé primaire `key`. Chaque écriture remplace
 * l'enregistrement entier.
 */

export interface ProfileSettings {
  firstName?: string;
  /** YYYY-MM-DD, facultative (D24) ; l'âge se calcule. */
  birthDate?: string;
  heightCm?: number;
}

export interface PreferenceSettings {
  theme: "light" | "dark" | "auto";
  timerSound: boolean;
  /** Repos proposé à l'ajout d'un exercice en séance libre. */
  freeWorkoutRestSec: number;
}

export interface TestCycleSettings {
  /** Dimanche de la première semaine de tests. */
  anchorWeekStart: string;
  everyWeeks: number;
}

export interface TestScheduleEntry {
  protocolKey: string;
  weekday: Weekday;
  slot: "morning" | "day" | "evening";
  templateId?: Id;
  placement?: PlannedTest["placement"];
  targetBlockId?: Id;
  targetStepId?: Id;
  targetStepIds?: Id[];
  adjustments?: PlannedTest["adjustments"];
}

/** Dates ISO d'installation : un seed dont le marqueur est posé ne se rejoue plus. */
export interface InstallMarkers {
  settingsDefaults?: string;
  testProtocols?: string;
  programV1?: string;
  routines?: string;
  routinesContent?: string;
  frames?: string;
  goals?: string;
  /** Cardio A en un seul bloc (décision du 24/09/2026). */
  cardioASingleBlock?: string;
  /** Correction ponctuelle de la Cardio A du 24/09/2026 (seed 10). */
  fixWorkout20260924?: string;
  /** Les blocs « sautés » de cette séance supprimés (seed 11). */
  removeSkipped20260924?: string;
  /** La séance du 25/09/2026, transcrite de la feuille de l'utilisateur (seed 12). */
  addWorkout20260925?: string;
  /** Thème Clair par défaut : l'ancien « Auto » par défaut passe à « Clair » (seed 14). */
  themeLight?: string;
  /** Premières cibles de trois cadres de Muscu B recalées d'après le 25/09 (seed 15). */
  frameTargets20260925?: string;
  /** Chaise contre le mur à 90° : nom, technique, consigne du test Jambes et de Muscu C (seed 16). */
  chair90?: string;
  /** Tests de la semaine du 27/09 attachés aux séances de journée générées avant le lot G (seed 17). */
  testsWeek20260927?: string;
  /** Ancien modèle « Muscu A » du 17/09, jamais utilisé, supprimé (seed 18). */
  removeOldMuscuA?: string;
  /** Muscu A du 27/09/2026 : le leg curl couché fait à la place du leg curl assis, ajouté (seed 21). */
  legCurlCouche20260927?: string;
  /** Traction assistée : cible 52 → 42 kg d'aide, d'après la séance du 02/10 (seed 22). */
  tractionTarget20261003?: string;
  /** Traction assistée : cran de 7 kg, celui de la machine (seed 23). */
  tractionIncrement20261003?: string;
  /** Muscu B : traction légère en premier ; Muscu C : suspension + omoplates (seed 24). */
  tractionPriority20261003?: string;
  /** Test traction, version 2 par paliers de 7 kg (seed 25). */
  tractionTest7kg20261003?: string;
  /** Seed 26 : pari traction V6 (Muscu A 3 × jusqu'à 5, Muscu B 3 × 8-10 hors palier, cadre 3 × 1-5). */
  tractionV620261004?: string;
  /** Programme V2 : modèles, règle, tests, séances du 04/10, cadres, objectifs (seed 19). */
  programV2?: string;
  /** Modèles V1 de musculation et de cardio archivés à partir du 04/10 (seed 20). */
  archiveProgramV1?: string;
}

export type SettingsRecord =
  | { key: "profile"; value: ProfileSettings }
  | { key: "preferences"; value: PreferenceSettings }
  | { key: "testCycle"; value: TestCycleSettings }
  | { key: "testSchedule"; value: TestScheduleEntry[] }
  | { key: "install"; value: InstallMarkers };

export type SettingsKey = SettingsRecord["key"];

export type SettingsValue<K extends SettingsKey> = Extract<SettingsRecord, { key: K }>["value"];
