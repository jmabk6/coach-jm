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
}

export type SettingsRecord =
  | { key: "profile"; value: ProfileSettings }
  | { key: "preferences"; value: PreferenceSettings }
  | { key: "testCycle"; value: TestCycleSettings }
  | { key: "testSchedule"; value: TestScheduleEntry[] }
  | { key: "install"; value: InstallMarkers };

export type SettingsKey = SettingsRecord["key"];

export type SettingsValue<K extends SettingsKey> = Extract<SettingsRecord, { key: K }>["value"];
