import Dexie from "dexie";

/**
 * Ouvre une base **telle qu'elle est**, sans déclarer de version (mode
 * dynamique de Dexie) : lecture seule en pratique, aucune migration.
 * Sert à l'export de secours quand la migration v3 a été refusée
 * (SCHEMA_DEXIE_V3_MIGRATION.md § 4.4) : le code v3 ne peut pas ouvrir la
 * base en la déclarant v2, mais il peut la lire ainsi.
 */
export async function openDatabaseAsIs(name = "coach-jm"): Promise<Dexie> {
  const database = new Dexie(name);
  await database.open();
  return database;
}
