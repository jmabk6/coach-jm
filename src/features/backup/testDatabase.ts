import Dexie from "dexie";
import { CoachJmDatabase, VERSION_1_STORES } from "../../db/database";

/**
 * Bases de test **indépendantes** de `coach-jm`, nom unique :
 * - version 1 : le schéma tel que l'application l'a créé jusqu'au lot 0
 *   (celui des sauvegardes réelles existantes), lu dans `database.ts` ;
 * - version 2 : la vraie classe de l'application (lot 1).
 */
export const TEST_V1_STORES = VERSION_1_STORES;

let counter = 0;

function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function createTestDatabase(prefix = "coach-jm-test", version: 1 | 2 = 1): Dexie {
  if (version === 2) {
    return new CoachJmDatabase(uniqueName(prefix));
  }

  const database = new Dexie(uniqueName(prefix));
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
