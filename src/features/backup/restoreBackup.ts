import type Dexie from "dexie";
import type { Table } from "dexie";
import { REMOVED_IN_V3 } from "../../db/database";
import { canonicalStringify, hashCanonical } from "./canonicalJson";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, readStores, storeHashesOf, type BackupEnvelope } from "./exportBackup";

/**
 * Restauration d'une sauvegarde dans une base **passée en paramètre**
 * (SCHEMA_DEXIE_V3_MIGRATION.md § 7). Restaurer = remplacer, jamais
 * fusionner, jamais à moitié :
 * - toute la validation précède toute écriture (format, comptes,
 *   empreintes, stores connus, données anciennes interdites) ;
 * - la base cible doit être vide ;
 * - l'écriture se fait dans **une** transaction, qui relit chaque store
 *   écrit et compare sa forme canonique à celle du fichier avant de se
 *   valider : au premier écart, tout est annulé.
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
  if (typeof envelope.formatVersion === "number" && envelope.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(
      `Sauvegarde d'une version plus récente de l'application (format ${envelope.formatVersion}) : mettez l'application à jour`,
    );
  }
  if (envelope.formatVersion !== 1 && envelope.formatVersion !== 2) {
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

/**
 * Recalcule l'empreinte globale et la compare à celle embarquée ; en
 * format 2, recalcule aussi l'empreinte de chaque store et nomme ceux
 * qui diffèrent.
 */
export async function verifyBackupIntegrity(
  envelope: BackupEnvelope,
): Promise<{ ok: boolean; computed: string; embedded: string; mismatchedStores: string[] }> {
  const computed = await hashCanonical(envelope.stores);
  const mismatchedStores: string[] = [];

  if (envelope.integrity.storeHashes) {
    const recomputed = await storeHashesOf(envelope.stores);
    const names = new Set([...Object.keys(recomputed), ...Object.keys(envelope.integrity.storeHashes)]);
    for (const name of names) {
      if (recomputed[name] !== envelope.integrity.storeHashes[name]) mismatchedStores.push(name);
    }
  }

  return {
    ok: computed === envelope.integrity.hash && mismatchedStores.length === 0,
    computed,
    embedded: envelope.integrity.hash,
    mismatchedStores,
  };
}

export interface RestoreResult {
  counts: Record<string, number>;
  /** Empreinte relue depuis la base après restauration, sur les stores du fichier. */
  hash: string;
  /** Stores du fichier écrits dans la base. */
  written: string[];
  /** Stores anciens du fichier, vides, ignorés (supprimés en v3). */
  skipped: string[];
}

export interface RestorePlan {
  written: string[];
  skipped: string[];
}

function hasIndex(table: Table | undefined, name: string): boolean {
  return table?.schema.indexes.some((index) => index.name === name) ?? false;
}

/**
 * Valide un fichier pour une base cible, **sans rien écrire** (cas A à F
 * de la matrice) : stores connus de la cible, stores supprimés en v3
 * vides, pas d'objectif de l'ancienne forme dans une base v3, empreintes
 * exactes. Rend les stores à écrire et ceux ignorés.
 */
export async function validateBackupForRestore(envelope: BackupEnvelope, database: Dexie): Promise<RestorePlan> {
  const tableNames = new Set(database.tables.map((table) => table.name));
  const written: string[] = [];
  const skipped: string[] = [];
  const forbidden: string[] = [];

  for (const [name, records] of Object.entries(envelope.stores)) {
    if (tableNames.has(name)) {
      written.push(name);
      continue;
    }
    if (!REMOVED_IN_V3.includes(name)) {
      throw new BackupValidationError(`Le store ${name} du fichier n'existe pas dans la base cible`);
    }
    if (records.length > 0) forbidden.push(`${name} (${records.length})`);
    else skipped.push(name);
  }

  /* Objectifs : une base v3 (index « key ») ne reprend pas l'ancienne forme. */
  const goals = envelope.stores.goals ?? [];
  const goalsTable = tableNames.has("goals") ? database.table("goals") : undefined;
  if (goals.length > 0 && hasIndex(goalsTable, "key") && goals.some((goal) => !(goal as { key?: unknown }).key)) {
    forbidden.push(`goals (${goals.length}, ancienne forme)`);
  }

  if (forbidden.length > 0) {
    throw new BackupValidationError(
      `Ce fichier contient des données que cette version ne sait pas porter : ${forbidden.join(", ")}. Rien n'a été écrit.`,
    );
  }

  const integrity = await verifyBackupIntegrity(envelope);

  if (!integrity.ok) {
    throw new BackupValidationError(
      integrity.mismatchedStores.length > 0
        ? `Empreinte différente pour : ${integrity.mismatchedStores.join(", ")}. Le fichier a été modifié ou abîmé.`
        : `Empreinte différente : fichier ${integrity.embedded.slice(0, 8)}, recalculée ${integrity.computed.slice(0, 8)}`,
    );
  }

  return { written, skipped };
}

function sortedCanonical(records: unknown[], key: string): string {
  const sorted = [...records].sort((a, b) => {
    const left = String((a as Record<string, unknown>)[key]);
    const right = String((b as Record<string, unknown>)[key]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return canonicalStringify(sorted);
}

/**
 * Restaure dans une base **vide**. En cas d'échec — validation, base non
 * vide, écriture, relecture —, la base reste telle qu'elle était : aucune
 * base à moitié restaurée.
 */
export async function restoreInto(envelope: BackupEnvelope, database: Dexie): Promise<RestoreResult> {
  return writeBackup(envelope, database, "empty");
}

/**
 * Remplacement atomique (§ 7.4, C.7 bis) : vidage de toutes les tables,
 * écriture et relecture dans **la même** transaction. Un échec, à
 * n'importe quelle étape, annule aussi le vidage : l'ancienne base reste
 * intacte. Jamais de base vide entre deux états.
 */
export async function replaceWith(envelope: BackupEnvelope, database: Dexie): Promise<RestoreResult> {
  return writeBackup(envelope, database, "replace");
}

async function writeBackup(envelope: BackupEnvelope, database: Dexie, mode: "empty" | "replace"): Promise<RestoreResult> {
  const plan = await validateBackupForRestore(envelope, database);

  await database.transaction("rw", database.tables, async () => {
    for (const table of database.tables) {
      if (mode === "replace") await table.clear();
      else if ((await table.count()) > 0) {
        throw new BackupValidationError(`La base cible n'est pas vide (${table.name}) : la restauration ne fusionne jamais`);
      }
    }

    for (const name of plan.written) {
      const records = envelope.stores[name] ?? [];
      if (records.length > 0) await database.table(name).bulkAdd(records as object[]);
    }

    /* Contrôle dans la transaction : formes canoniques relues = fichier.
       On compare des chaînes, pas des SHA-256 : attendre crypto.subtle
       validerait la transaction avant la fin du contrôle. */
    for (const name of plan.written) {
      const table = database.table(name);
      const key = String(table.schema.primKey.keyPath);
      const readBack = sortedCanonical(await table.toArray(), key);
      if (readBack !== sortedCanonical(envelope.stores[name] ?? [], key)) {
        throw new BackupValidationError(`Relecture différente du fichier pour ${name} : restauration annulée`);
      }
    }
    for (const table of database.tables) {
      if (!plan.written.includes(table.name) && (await table.count()) > 0) {
        throw new BackupValidationError(`${table.name} devrait être vide après restauration : restauration annulée`);
      }
    }
  });

  const { stores, counts } = await readStores(database);
  const hash = await hashCanonical(
    Object.fromEntries(Object.keys(envelope.stores).map((name) => [name, stores[name] ?? []])),
  );

  return { counts, hash, written: plan.written, skipped: plan.skipped };
}

/** Nom historique (lots 0 et 1), conservé pour les appels existants. */
export const restoreBackup = restoreInto;
