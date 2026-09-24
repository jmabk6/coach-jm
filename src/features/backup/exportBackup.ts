import type Dexie from "dexie";
import { CANONICAL_RULE, canonicalStringify, hashCanonical } from "./canonicalJson";
import { auditStores, describeIssue, type SerializationIssue } from "./serializationAudit";

/**
 * Lecture complète de la base en vue d'une sauvegarde (conception lot 0,
 * § 3 à 5). Ce module **ne dépend d'aucun repository** et n'importe rien
 * qui écrive : il reçoit la base, l'ouvre en transaction de lecture seule,
 * et rend une enveloppe. Il ne sait pas partager, ni restaurer.
 */

export const BACKUP_FORMAT = "coach-jm-backup";
/**
 * Format 2 (lot C, SCHEMA_DEXIE_V3_MIGRATION.md § 6) : empreinte par store
 * et empreinte des sept stores d'origine en plus de l'empreinte globale.
 * Le format 1 reste produit par l'export de secours d'une base restée en
 * v2 (§ 4.4), et reste lisible.
 */
export const BACKUP_FORMAT_VERSION = 2;
export type BackupFormatVersion = 1 | 2;

export interface BackupContext {
  now: Date;
  buildTime: string;
  userAgent: string;
  standalone: boolean;
  /** Version de l'application (`package.json`), format 2. */
  appVersion?: string;
}

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  formatVersion: BackupFormatVersion;
  exportedAt: string;
  app: { buildTime: string; version?: string };
  device: { userAgent: string; standalone: boolean };
  /** `version` = `db.verno` telle que lue : c'est le fichier qui dit le schéma, pas une hypothèse. */
  database: { name: string; version: number };
  counts: Record<string, number>;
  /** Avertissements de sérialisation sans perte d'information (voir `serializationAudit`). */
  warnings: SerializationIssue[];
  integrity: {
    algorithm: "SHA-256";
    canonical: typeof CANONICAL_RULE;
    /** Empreinte de l'objet `stores` entier, et de rien d'autre. */
    hash: string;
    /** Format 2 : empreinte de chaque store, pour prouver store par store qu'une migration n'a rien changé. */
    storeHashes?: Record<string, string>;
  };
  /** Format 2 : empreinte des sept stores d'origine, si le fichier les contient tous. */
  legacyIntegrity?: { hash7: string };
  stores: Record<string, unknown[]>;
}

/**
 * Empreinte des sept stores d'origine (`LEGACY_STORE_ORDER`, plus bas),
 * comparable d'une version de schéma à l'autre ; `undefined` si l'un manque.
 */
export async function legacyHash7(stores: Record<string, unknown[]>): Promise<string | undefined> {
  if (!LEGACY_STORE_ORDER.every((name) => Array.isArray(stores[name]))) return undefined;

  return hashCanonical(Object.fromEntries(LEGACY_STORE_ORDER.map((name) => [name, stores[name]])));
}

/** Empreinte de chaque store. */
export async function storeHashesOf(stores: Record<string, unknown[]>): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const [name, records] of Object.entries(stores)) hashes[name] = await hashCanonical(records);
  return hashes;
}

export class BackupSerializationError extends Error {
  readonly issues: SerializationIssue[];

  constructor(issues: SerializationIssue[]) {
    super(
      `Sauvegarde refusée : ${issues.length} valeur${issues.length > 1 ? "s" : ""} sans forme JSON fidèle — ` +
        issues.slice(0, 5).map(describeIssue).join(" ; ") +
        (issues.length > 5 ? " ; …" : ""),
    );
    this.name = "BackupSerializationError";
    this.issues = issues;
  }
}

function compareKeys(a: unknown, b: unknown): number {
  const left = String(a);
  const right = String(b);

  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Lit tous les stores ouverts dans **une** transaction en lecture seule :
 * instantané cohérent, et toute écriture y serait rejetée par Dexie.
 */
export async function readStores(database: Dexie): Promise<{ stores: Record<string, unknown[]>; counts: Record<string, number> }> {
  return database.transaction("r", database.tables, async () => {
    const stores: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    for (const table of database.tables) {
      const keyPath = table.schema.primKey.keyPath;
      const key = typeof keyPath === "string" ? keyPath : undefined;
      const records = (await table.toArray()) as unknown[];

      if (key) {
        records.sort((a, b) =>
          compareKeys((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
        );
      }

      stores[table.name] = records;
      counts[table.name] = await table.count();
    }

    return { stores, counts };
  });
}

/**
 * Construit l'enveloppe : lecture, audit de sérialisation, comptes
 * recoupés, empreinte, puis contrôle aller-retour du JSON. Lève si une
 * valeur n'a pas de forme JSON fidèle ou si les comptes divergent.
 */
export async function readBackup(
  database: Dexie,
  context: BackupContext,
  options: { formatVersion?: BackupFormatVersion } = {},
): Promise<BackupEnvelope> {
  const formatVersion = options.formatVersion ?? BACKUP_FORMAT_VERSION;
  const { stores, counts } = await readStores(database);

  for (const [name, records] of Object.entries(stores)) {
    if (counts[name] !== records.length) {
      throw new Error(`Sauvegarde interrompue : ${name} compte ${counts[name]} enregistrements, ${records.length} lus`);
    }
  }

  const issues = auditStores(stores);
  const blocking = issues.filter((issue) => issue.severity === "unserializable");

  if (blocking.length > 0) {
    throw new BackupSerializationError(blocking);
  }

  const hash = await hashCanonical(stores);

  /* Aller-retour : ce que le fichier contiendra se relit à l'identique
     sous la forme canonique. Une divergence ici serait un défaut de
     l'audit, pas des données : on préfère refuser qu'écrire un fichier
     faux. */
  const roundTrip = JSON.parse(JSON.stringify(stores)) as Record<string, unknown[]>;

  if (canonicalStringify(roundTrip) !== canonicalStringify(stores)) {
    throw new Error("Sauvegarde interrompue : la relecture du JSON ne rend pas les mêmes données");
  }

  if (formatVersion === 1) {
    return {
      format: BACKUP_FORMAT,
      formatVersion,
      exportedAt: context.now.toISOString(),
      app: { buildTime: context.buildTime },
      device: { userAgent: context.userAgent, standalone: context.standalone },
      database: { name: database.name, version: database.verno },
      counts,
      warnings: issues.filter((issue) => issue.severity === "lossy"),
      integrity: { algorithm: "SHA-256", canonical: CANONICAL_RULE, hash },
      stores,
    };
  }

  const hash7 = await legacyHash7(stores);

  return {
    format: BACKUP_FORMAT,
    formatVersion,
    exportedAt: context.now.toISOString(),
    app: { buildTime: context.buildTime, ...(context.appVersion ? { version: context.appVersion } : {}) },
    device: { userAgent: context.userAgent, standalone: context.standalone },
    database: { name: database.name, version: database.verno },
    counts,
    warnings: issues.filter((issue) => issue.severity === "lossy"),
    integrity: { algorithm: "SHA-256", canonical: CANONICAL_RULE, hash, storeHashes: await storeHashesOf(stores) },
    ...(hash7 ? { legacyIntegrity: { hash7 } } : {}),
    stores,
  };
}

/** Le texte du fichier : lisible (indentation 2), stable. */
export function serializeBackup(envelope: BackupEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

/** `coach-jm-sauvegarde-2026-09-19-1042.json`, en heure locale. */
export function backupFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;

  return `coach-jm-sauvegarde-${date}-${time}.json`;
}

export const STORE_LABELS: Record<string, string> = {
  exercises: "Exercices",
  sessionTemplates: "Modèles de séance",
  weeklyPrograms: "Programmation",
  plannedSessions: "Séances planifiées",
  workouts: "Séances réalisées",
  goals: "Objectifs",
  weightEntries: "Pesées",
  strengthFrames: "Cadres de musculation",
  strengthFrameVersions: "Versions de cadre",
  strengthMilestones: "Jalons de musculation",
  rpeScaleVersions: "Échelles de RPE",
  cardioProtocols: "Protocoles cardio",
  cardioProtocolVersions: "Versions de protocole cardio",
  cardioTests: "Tests cardio",
  cardioTestMeasures: "Mesures de test cardio",
  mobilityProtocolVersions: "Protocoles de mobilité",
  mobilityAssessments: "Bilans de mobilité",
  mobilityMeasures: "Mesures de mobilité",
  mobilityObservations: "Observations de mobilité",
  testProtocols: "Protocoles de tests",
  testProtocolVersions: "Versions de protocole de test",
  testResults: "Résultats de tests",
  settings: "Réglages",
};

/** Les sept stores d'origine, dans l'ordre d'affichage : toujours montrés, même à zéro. */
export const LEGACY_STORE_ORDER = [
  "exercises",
  "sessionTemplates",
  "weeklyPrograms",
  "plannedSessions",
  "workouts",
  "goals",
  "weightEntries",
];
const LEGACY_STORE_NAMES = new Set(LEGACY_STORE_ORDER);

/**
 * Comptes à afficher : les stores d'origine et tout store non vide ; les
 * nouveaux stores encore vides sont résumés sur une ligne (`hiddenEmpty`)
 * pour que la carte reste lisible sur un téléphone. Le fichier, lui,
 * contient toujours tous les stores.
 */
export function splitCountsForDisplay(counts: Record<string, number>): {
  shown: Array<[string, number]>;
  hiddenEmpty: number;
} {
  const entries = Object.entries(counts);
  const rank = (name: string) => {
    const index = LEGACY_STORE_ORDER.indexOf(name);
    return index === -1 ? LEGACY_STORE_ORDER.length : index;
  };
  const shown = entries
    .filter(([name, count]) => LEGACY_STORE_NAMES.has(name) || count > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || storeLabel(a).localeCompare(storeLabel(b), "fr"));

  return { shown, hiddenEmpty: entries.length - shown.length };
}

export function storeLabel(name: string): string {
  return STORE_LABELS[name] ?? name;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
