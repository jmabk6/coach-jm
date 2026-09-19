import Dexie, { type Table } from "dexie";

import type {
  CardioProtocol,
  CardioProtocolVersion,
  CardioTest,
  CardioTestMeasure,
  Exercise,
  Goal,
  MobilityAssessment,
  MobilityMeasure,
  MobilityObservation,
  MobilityProtocolVersion,
  PlannedSession,
  RpeScaleVersion,
  SessionTemplate,
  StrengthFrame,
  StrengthFrameVersion,
  StrengthMilestone,
  WeeklyProgram,
  WeightEntry,
  WorkoutSession,
} from "../domain";

/**
 * Version courante du schéma. Les tests de migration s'y réfèrent pour ne
 * pas figer un nombre en dur.
 */
export const DATABASE_VERSION = 2;

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

export type StoreName = keyof typeof VERSION_2_STORES;

export const STORE_NAMES = Object.keys(VERSION_2_STORES) as StoreName[];

export class CoachJmDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  sessionTemplates!: Table<SessionTemplate, string>;
  weeklyPrograms!: Table<WeeklyProgram, string>;
  plannedSessions!: Table<PlannedSession, string>;
  workouts!: Table<WorkoutSession, string>;
  goals!: Table<Goal, string>;
  weightEntries!: Table<WeightEntry, string>;

  strengthFrames!: Table<StrengthFrame, string>;
  strengthFrameVersions!: Table<StrengthFrameVersion, string>;
  strengthMilestones!: Table<StrengthMilestone, string>;
  rpeScaleVersions!: Table<RpeScaleVersion, string>;

  cardioProtocols!: Table<CardioProtocol, string>;
  cardioProtocolVersions!: Table<CardioProtocolVersion, string>;
  cardioTests!: Table<CardioTest, string>;
  cardioTestMeasures!: Table<CardioTestMeasure, string>;

  mobilityProtocolVersions!: Table<MobilityProtocolVersion, string>;
  mobilityAssessments!: Table<MobilityAssessment, string>;
  mobilityMeasures!: Table<MobilityMeasure, string>;
  mobilityObservations!: Table<MobilityObservation, string>;

  /**
   * Le nom ne sert qu'aux tests, qui ouvrent des bases indépendantes ;
   * l'application n'utilise que `coach-jm`.
   */
  constructor(name = "coach-jm") {
    super(name);

    /**
     * Important :
     * les chaînes ci-dessous définissent uniquement les index IndexedDB.
     * Les autres propriétés des objets sont quand même enregistrées.
     */
    this.version(1).stores(VERSION_1_STORES);

    this.version(DATABASE_VERSION).stores(VERSION_2_STORES);
  }
}

export const db = new CoachJmDatabase();
