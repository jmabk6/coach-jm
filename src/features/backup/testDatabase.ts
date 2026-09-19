import Dexie from "dexie";

/**
 * Bases de test **indépendantes** de `coach-jm` : même schéma v1 que
 * l'application, nom unique. Le test `schemaMirror` vérifie que cette
 * copie ne dérive pas de `src/db/database.ts` (stores et index égaux).
 */
export const TEST_V1_STORES = {
  exercises:
    "id, name, zone, movement, equipment, location, mode, measurementType, status, updatedAt",
  sessionTemplates: "id, name, category, status, position, updatedAt",
  weeklyPrograms: "id, name, updatedAt",
  plannedSessions: "id, date, sessionTemplateId, status, source, updatedAt",
  workouts:
    "id, date, plannedSessionId, sessionTemplateId, source, status, startedAt, completedAt, updatedAt",
  goals: "id, status, dueDate, achievedAt, updatedAt",
  weightEntries: "id, &date, kg, updatedAt",
} as const;

let counter = 0;

export function createTestDatabase(prefix = "coach-jm-test"): Dexie {
  counter += 1;
  const database = new Dexie(`${prefix}-${Date.now()}-${counter}`);
  database.version(1).stores(TEST_V1_STORES);

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
