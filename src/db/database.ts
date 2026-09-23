import Dexie, { type Table, type Transaction } from "dexie";

import type {
  Exercise,
  Goal,
  PlannedSession,
  RpeScaleVersion,
  SessionTemplate,
  SettingsRecord,
  StrengthFrame,
  StrengthFrameVersion,
  StrengthMilestone,
  TestProtocol,
  TestProtocolVersion,
  TestResult,
  WeeklyProgram,
  WeightEntry,
  WorkoutSession,
} from "../domain";

/**
 * Version courante du schéma. Les tests de migration s'y réfèrent pour ne
 * pas figer un nombre en dur.
 */
export const DATABASE_VERSION = 3;

/**
 * Index de la version 1, conservés tels quels : Dexie a besoin de
 * l'historique complet des versions pour migrer une base ancienne.
 * Exportés pour que les tests puissent recréer une base v1 authentique.
 */
export const VERSION_1_STORES = {
  exercises:
    "id, name, zone, movement, equipment, location, mode, measurementType, status, updatedAt",

  sessionTemplates:
    "id, name, category, status, position, updatedAt",

  weeklyPrograms:
    "id, name, updatedAt",

  plannedSessions:
    "id, date, sessionTemplateId, status, source, updatedAt",

  workouts:
    "id, date, plannedSessionId, sessionTemplateId, source, status, startedAt, completedAt, updatedAt",

  goals:
    "id, status, dueDate, achievedAt, updatedAt",

  weightEntries:
    "id, &date, kg, updatedAt",
} as const;

/**
 * Version 2 (conception technique v1.5, § 7) : deux stores existants
 * voient leurs index enrichis, douze stores sont ajoutés, aucun n'est
 * supprimé. Aucune fonction `upgrade()` : tous les champs ajoutés sont
 * facultatifs et leur absence est un état valide — une séance sans
 * `kind` est une séance d'entraînement, une série sans `role` est une
 * série de travail. Rien n'est réécrit dans les enregistrements existants.
 */
export const VERSION_2_STORES = {
  // existants, index enrichis
  exercises:
    "id, name, zone, movement, equipment, location, mode, " +
    "measurementType, status, updatedAt, progressionGroup, movementFamily",
  workouts:
    "id, date, plannedSessionId, sessionTemplateId, source, status, " +
    "startedAt, completedAt, updatedAt, kind",
  // inchangés
  sessionTemplates: "id, name, category, status, position, updatedAt",
  weeklyPrograms: "id, name, updatedAt",
  plannedSessions: "id, date, sessionTemplateId, status, source, updatedAt",
  goals: "id, status, dueDate, achievedAt, updatedAt",
  weightEntries: "id, &date, kg, updatedAt",
  // nouveaux
  strengthFrames: "id, exerciseId, updatedAt",
  strengthFrameVersions: "id, frameId, status, updatedAt",
  strengthMilestones: "id, frameVersionId, workoutId, date",
  rpeScaleVersions: "id, status, startDate",
  cardioProtocols: "id, indicator, cycleWeek",
  cardioProtocolVersions: "id, protocolId, status",
  cardioTests: "id, versionId, date, status",
  cardioTestMeasures: "id, testId, [testId+key]",
  mobilityProtocolVersions: "id, status, startDate",
  mobilityAssessments: "id, &workoutId, versionId, date",
  mobilityMeasures: "id, assessmentId, [assessmentId+key]",
  mobilityObservations: "id, assessmentId",
} as const;

/**
 * Version 3 (SCHEMA_DEXIE_V3_MIGRATION.md § 2) : quatre stores créés
 * (tests, réglages), `goals` refondu (index `&key, position`), huit stores
 * cardio / mobilité supprimés — sous garde : `guardV3Migration` refuse la
 * migration si l'un d'eux, ou `goals`, contient un enregistrement. Aucun
 * enregistrement existant n'est lu ni réécrit par la migration : les
 * champs ajoutés sont facultatifs, leur absence est l'ancien comportement.
 */
export const VERSION_3_STORES = {
  exercises:
    "id, name, zone, movement, equipment, location, mode, " +
    "measurementType, status, updatedAt, progressionGroup, movementFamily",
  sessionTemplates: "id, name, category, status, position, updatedAt",
  weeklyPrograms: "id, name, updatedAt",
  plannedSessions: "id, date, sessionTemplateId, status, source, updatedAt",
  workouts:
    "id, date, plannedSessionId, sessionTemplateId, source, status, " +
    "startedAt, completedAt, updatedAt, kind",
  weightEntries: "id, &date, kg, updatedAt",
  strengthFrames: "id, exerciseId, updatedAt",
  strengthFrameVersions: "id, frameId, status, updatedAt",
  strengthMilestones: "id, frameVersionId, workoutId, date",
  rpeScaleVersions: "id, status, startDate",
  goals: "id, &key, position, updatedAt",
  testProtocols: "id, &key, status",
  testProtocolVersions: "id, protocolId, status",
  testResults: "id, protocolId, versionId, date, workoutId, [protocolId+date]",
  settings: "key",
  cardioProtocols: null,
  cardioProtocolVersions: null,
  cardioTests: null,
  cardioTestMeasures: null,
  mobilityProtocolVersions: null,
  mobilityAssessments: null,
  mobilityMeasures: null,
  mobilityObservations: null,
} as const;

type Version3Schema = typeof VERSION_3_STORES;

export type StoreName = {
  [K in keyof Version3Schema]: Version3Schema[K] extends null ? never : K;
}[keyof Version3Schema];

/** Les quinze stores de la version 3, dans l'ordre de déclaration. */
export const STORE_NAMES = Object.entries(VERSION_3_STORES)
  .filter(([, schema]) => schema !== null)
  .map(([name]) => name) as StoreName[];

/** Stores supprimés par la version 3 : ils doivent être vides pour migrer. */
export const REMOVED_IN_V3 = Object.entries(VERSION_3_STORES)
  .filter(([, schema]) => schema === null)
  .map(([name]) => name);

/**
 * Stores contrôlés par la garde : les huit supprimés, et `goals`, dont la
 * forme change (aucun objectif n'a jamais été écrit par l'application).
 */
export const V3_GUARDED_STORES: readonly string[] = [...REMOVED_IN_V3, "goals"];

/** Refus de migration : des données que la version 3 ne sait pas porter. */
export class MigrationGuardError extends Error {
  readonly counts: Record<string, number>;

  constructor(counts: Record<string, number>) {
    super(
      "Mise à jour des données arrêtée : " +
        Object.entries(counts)
          .map(([store, count]) => `${store} (${count})`)
          .join(", ") +
        " contiennent des données que cette version ne sait pas porter. Rien n'a été modifié.",
    );
    this.name = "MigrationGuardError";
    this.counts = counts;
  }
}

/**
 * Garde de la migration v2 → v3 (SCHEMA_DEXIE_V3_MIGRATION.md § 4.2, C-3) :
 * lecture seule des stores gardés, exception si l'un n'est pas vide — la
 * transaction de changement de version est alors annulée, la base reste
 * en v2, intacte. Dexie 4.4.6 laisse l'upgrade lire les stores déclarés
 * `null` : ils ne sont supprimés qu'après (test `dexieUpgradeBehavior`).
 */
export async function guardV3Migration(tx: Transaction): Promise<void> {
  const counts: Record<string, number> = {};

  for (const store of V3_GUARDED_STORES) {
    const count = await tx.table(store).count();
    if (count > 0) counts[store] = count;
  }

  if (Object.keys(counts).length > 0) {
    throw new MigrationGuardError(counts);
  }
}

export interface CoachJmDatabaseOptions {
  /** Tests seulement : remplace la garde pour simuler une panne (T-5). */
  upgradeGuard?: (tx: Transaction) => Promise<void>;
}

export class CoachJmDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  sessionTemplates!: Table<SessionTemplate, string>;
  weeklyPrograms!: Table<WeeklyProgram, string>;
  plannedSessions!: Table<PlannedSession, string>;
  workouts!: Table<WorkoutSession, string>;
  weightEntries!: Table<WeightEntry, string>;

  strengthFrames!: Table<StrengthFrame, string>;
  strengthFrameVersions!: Table<StrengthFrameVersion, string>;
  strengthMilestones!: Table<StrengthMilestone, string>;
  rpeScaleVersions!: Table<RpeScaleVersion, string>;

  goals!: Table<Goal, string>;
  testProtocols!: Table<TestProtocol, string>;
  testProtocolVersions!: Table<TestProtocolVersion, string>;
  testResults!: Table<TestResult, string>;
  settings!: Table<SettingsRecord, string>;

  /**
   * Le nom ne sert qu'aux tests, qui ouvrent des bases indépendantes ;
   * l'application n'utilise que `coach-jm`.
   */
  constructor(name = "coach-jm", options: CoachJmDatabaseOptions = {}) {
    super(name);

    /**
     * Important :
     * les chaînes ci-dessous définissent uniquement les index IndexedDB.
     * Les autres propriétés des objets sont quand même enregistrées.
     * Dexie a besoin de l'historique complet des versions.
     */
    this.version(1).stores(VERSION_1_STORES);
    this.version(2).stores(VERSION_2_STORES);
    this.version(DATABASE_VERSION)
      .stores(VERSION_3_STORES)
      .upgrade(options.upgradeGuard ?? guardV3Migration);
  }
}

export const db = new CoachJmDatabase();
