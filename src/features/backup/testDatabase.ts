import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Id,
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
 * Objectif sous la forme des schémas v1 et v2 (cible unique). Aucun code
 * ne l'a jamais écrit ; la migration v3 refuse une base qui en contient
 * (SCHEMA_DEXIE_V3_MIGRATION § 4.2). Sorti du domaine au lot N : il ne
 * sert plus qu'aux tests de migration.
 */
export interface LegacyGoalV1 {
  id: Id;
  name: string;
  target:
    | { kind: "exercise"; exerciseId: Id; metric: "max_load" | "volume" | "reps" | "max_duration"; targetValue: number }
    | { kind: "cardio_bpm"; exerciseId: Id; durationSec: number; speedKmh: number; inclinePercent: number; targetBpm: number }
    | { kind: "weight"; targetKg: number; direction: "lose" | "gain" };
  status: "active" | "achieved";
  dueDate?: string;
  note?: string;
  achievedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Enregistrement d'un store des tests cardio ou de mobilité du schéma v2,
 * retirés en v3 ; leurs types de domaine sont retirés au lot N.
 */
export type LegacyRecord = { id: Id } & Record<string, unknown>;

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
  cardioProtocols!: Table<LegacyRecord, string>;
  cardioProtocolVersions!: Table<LegacyRecord, string>;
  cardioTests!: Table<LegacyRecord, string>;
  cardioTestMeasures!: Table<LegacyRecord, string>;
  mobilityProtocolVersions!: Table<LegacyRecord, string>;
  mobilityAssessments!: Table<LegacyRecord, string>;
  mobilityMeasures!: Table<LegacyRecord, string>;
  mobilityObservations!: Table<LegacyRecord, string>;

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
