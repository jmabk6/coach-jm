import type { CoachJmDatabase } from "../../db/database";
import { suspendSeeds } from "../seed/runSeeds";
import type { BackupEnvelope } from "./exportBackup";
import { restoreInto, validateBackupForRestore, type RestoreResult } from "./restoreBackup";

/**
 * Le seul chemin d'import de l'interface (SCHEMA_DEXIE_V3_MIGRATION.md
 * § 7.4). L'export de sécurité et la double confirmation (étape 2) sont
 * portés par l'écran, avant l'appel ; le rechargement (étape 6) aussi.
 *
 * 1. validation complète du fichier contre le schéma de la base : un
 *    refus lève **avant** tout effacement, la base reste intacte ;
 * 3. seeds suspendus, base fermée, supprimée, rouverte vide ;
 * 4. `restoreInto` : une transaction, relecture comparée au fichier ;
 * 5. un échec en 4 laisse la base **vide** et cohérente : on réimporte
 *    l'export de sécurité par le même chemin.
 */
export async function resetAndRestore(envelope: BackupEnvelope, database: CoachJmDatabase): Promise<RestoreResult> {
  await validateBackupForRestore(envelope, database);

  await eraseDatabase(database);
  await database.open();

  return restoreInto(envelope, database);
}

/**
 * Effacement total (§ 8) : la base disparaît. Seeds suspendus jusqu'au
 * rechargement, qui les rejoue sur une base neuve.
 */
export async function eraseDatabase(database: CoachJmDatabase): Promise<void> {
  suspendSeeds();
  database.close();
  await database.delete();
}
