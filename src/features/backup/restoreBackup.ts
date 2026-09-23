import type Dexie from "dexie";
import { REMOVED_IN_V3 } from "../../db/database";
import { hashCanonical } from "./canonicalJson";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, readStores, type BackupEnvelope } from "./exportBackup";

/**
 * Restauration d'une sauvegarde dans une base **passée en paramètre**
 * (conception lot 0, § 7). Dans ce lot, elle n'est appelée que par les
 * tests et par la console de développement : aucun écran ne l'expose,
 * et rien ne permet de viser la base personnelle depuis l'interface.
 *
 * Règles : enveloppe valide, empreinte recalculée égale, base cible
 * entièrement vide, écriture atomique, puis relecture et comparaison
 * d'empreinte (export → restauration → export doit rendre la même).
 */

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

export function parseBackup(text: string): BackupEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupValidationError("Le fichier n'est pas un JSON lisible");
  }

  const envelope = parsed as Partial<BackupEnvelope>;

  if (envelope.format !== BACKUP_FORMAT) {
    throw new BackupValidationError(`Format inattendu : ${String(envelope.format)}`);
  }
  if (envelope.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(`Version de format inconnue : ${String(envelope.formatVersion)}`);
  }
  if (!envelope.stores || typeof envelope.stores !== "object" || !envelope.counts || !envelope.integrity?.hash) {
    throw new BackupValidationError("Enveloppe incomplète : stores, counts ou integrity manquants");
  }

  for (const [name, count] of Object.entries(envelope.counts)) {
    const records = envelope.stores[name];
    if (!Array.isArray(records)) {
      throw new BackupValidationError(`Store manquant dans le fichier : ${name}`);
    }
    if (records.length !== count) {
      throw new BackupValidationError(`${name} : ${count} annoncés, ${records.length} présents`);
    }
  }

  return envelope as BackupEnvelope;
}

/** Recalcule l'empreinte et la compare à celle embarquée. */
export async function verifyBackupIntegrity(envelope: BackupEnvelope): Promise<{ ok: boolean; computed: string; embedded: string }> {
  const computed = await hashCanonical(envelope.stores);

  return { ok: computed === envelope.integrity.hash, computed, embedded: envelope.integrity.hash };
}

export interface RestoreResult {
  counts: Record<string, number>;
  /** Empreinte relue depuis la base après restauration. */
  hash: string;
}

export async function restoreBackup(envelope: BackupEnvelope, database: Dexie): Promise<RestoreResult> {
  const tableNames = new Set(database.tables.map((table) => table.name));

  for (const [name, records] of Object.entries(envelope.stores)) {
    if (tableNames.has(name)) continue;
    /* Store supprimé par la v3 (cardio, mobilité) : ignoré s'il est vide,
       refusé sinon — cette version ne sait pas porter ses données. */
    if (REMOVED_IN_V3.includes(name) && records.length > 0) {
      throw new BackupValidationError(
        `Le fichier contient des données (${name}) que cette version ne sait pas porter`,
      );
    }
    if (!REMOVED_IN_V3.includes(name)) {
      throw new BackupValidationError(`Le store ${name} du fichier n'existe pas dans la base cible`);
    }
  }

  const integrity = await verifyBackupIntegrity(envelope);

  if (!integrity.ok) {
    throw new BackupValidationError(
      `Empreinte différente : fichier ${integrity.embedded.slice(0, 8)}, recalculée ${integrity.computed.slice(0, 8)}`,
    );
  }

  await database.transaction("rw", database.tables, async () => {
    for (const table of database.tables) {
      if ((await table.count()) > 0) {
        throw new BackupValidationError(`La base cible n'est pas vide (${table.name}) : la restauration ne fusionne jamais`);
      }
    }

    for (const [name, records] of Object.entries(envelope.stores)) {
      if (records.length > 0 && tableNames.has(name)) {
        await database.table(name).bulkAdd(records as object[]);
      }
    }
  });

  /* La base cible peut avoir plus de stores que le fichier (sauvegarde v1
     restaurée dans une base v2) : l'empreinte de contrôle porte sur les
     stores du fichier ; les autres doivent simplement être restés vides. */
  const { stores, counts } = await readStores(database);
  const restoredOnly = Object.fromEntries(
    Object.keys(envelope.stores).map((name) => [name, stores[name] ?? []]),
  );
  const hash = await hashCanonical(restoredOnly);

  if (hash !== envelope.integrity.hash) {
    throw new BackupValidationError("Après restauration, la base ne rend pas l'empreinte du fichier");
  }

  for (const [name, count] of Object.entries(counts)) {
    if (!(name in envelope.stores) && count !== 0) {
      throw new BackupValidationError(`Après restauration, le store ${name} (absent du fichier) n'est pas vide`);
    }
  }

  return { counts, hash };
}
