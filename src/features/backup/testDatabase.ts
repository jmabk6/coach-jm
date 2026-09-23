import Dexie, { type Table } from "dexie";
import type {
  CardioProtocol,
  CardioProtocolVersion,
  CardioTest,
  CardioTestMeasure,
  Exercise,
  LegacyGoalV1,
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
} from "../../domain";
import { CoachJmDatabase, VERSION_1_STORES, VERSION_2_STORES, type CoachJmDatabaseOptions } from "../../db/database";

/**
 * Bases de test **indépendantes** de `coach-jm`, nom unique :
 * - version 1 : le schéma tel que l'application l'a créé jusqu'au lot 0 ;
 * - version 2 : le schéma des lots 1 à B (celui des sauvegardes réelles
 *   du 20, du 22 et du 23/09), figé ici pour les tests ;
 * - version 3 : la vraie classe de l'application (lot C).
 */
export const TEST_V1_STORES = VERSION_1_STORES;

/** La base telle que l'application l'a créée du lot 1 au lot B : versions 1 et 2. */
export class CoachJmDatabaseV2 extends Dexie {
  exercises!: Table<Exercise, string>;
  sessionTemplates!: Table<SessionTemplate, string>;
  weeklyPrograms!: Table<WeeklyProgram, string>;
  plannedSessions!: Table<PlannedSession, string>;
  workouts!: Table<WorkoutSession, string>;
  goals!: Table<LegacyGoalV1, string>;
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

  constructor(name: string) {
    super(name);
    this.version(1).stores(VERSION_1_STORES);
    this.version(2).stores(VERSION_2_STORES);
  }
}

let counter = 0;

export function uniqueTestName(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function createTestDatabase(prefix?: string, version?: 1 | 2): Dexie;
export function createTestDatabase(prefix: string, version: 3, options?: CoachJmDatabaseOptions): CoachJmDatabase;
export function createTestDatabase(
  prefix = "coach-jm-test",
  version: 1 | 2 | 3 = 1,
  options: CoachJmDatabaseOptions = {},
): Dexie {
  if (version === 3) return new CoachJmDatabase(uniqueTestName(prefix), options);
  if (version === 2) return new CoachJmDatabaseV2(uniqueTestName(prefix));

  const database = new Dexie(uniqueTestName(prefix));
  database.version(1).stores(VERSION_1_STORES);

  return database;
}

/** Signature comparable d'un schéma Dexie ouvert : store → index triés. */
export function describeSchema(database: Dexie): Record<string, string[]> {
  return Object.fromEntries(
    database.tables.map((table) => [
      table.name,
      [
        `pk:${String(table.schema.primKey.keyPath)}`,
        ...table.schema.indexes
          .map((index) => `${index.unique ? "&" : ""}${String(index.keyPath)}`)
          .sort(),
      ],
    ]),
  );
}

/** Méthodes d'écriture de Dexie, pour les espions des tests de non-modification. */
export const WRITE_METHODS = ["add", "put", "update", "delete", "clear", "bulkAdd", "bulkPut", "bulkUpdate", "bulkDelete"] as const;

export function writePrototypeOf(database: Dexie): Record<string, (...args: unknown[]) => unknown> {
  const table = database.tables[0];
  if (!table) throw new Error("base sans store");
  /* Les méthodes d'écriture sont sur le prototype parent de Table. */
  return Object.getPrototypeOf(Object.getPrototypeOf(table)) as Record<string, (...args: unknown[]) => unknown>;
}
