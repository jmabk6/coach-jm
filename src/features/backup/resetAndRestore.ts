import type { CoachJmDatabase } from "../../db/database";
import { suspendSeeds } from "../seed/runSeeds";
import type { BackupEnvelope } from "./exportBackup";
import { replaceWith, type RestoreResult } from "./restoreBackup";

/**
 * Le seul chemin d'import de l'interface (SCHEMA_DEXIE_V3_MIGRATION.md
 * § 7.4). L'export de sécurité et la double confirmation (étape 2) sont
 * portés par l'écran, avant l'appel ; le rechargement (étape 6) aussi.
 *
 * C.7 bis : plus d'effacement de la base avant l'écriture. La base a déjà
 * le schéma v3 ; `replaceWith` valide le fichier, puis vide, écrit et
 * relit **dans une seule transaction**. Un refus ou une panne, à
 * n'importe quel moment, laisse l'ancienne base intacte.
 */
export async function resetAndRestore(envelope: BackupEnvelope, database: CoachJmDatabase): Promise<RestoreResult> {
  return replaceWith(envelope, database);
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
