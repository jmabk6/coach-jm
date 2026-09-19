/**
 * Audit de sérialisation (conception sauvegarde lot 0, ajustement du
 * 19/09/2026) : `exactOptionalPropertyTypes` ne dit rien des anciens
 * enregistrements IndexedDB. Avant d'écrire le fichier, chaque valeur est
 * inspectée ; ce que `JSON.stringify` perdrait ou transformerait est
 * **détecté et nommé**, jamais ignoré en silence.
 *
 * Deux gravités :
 * - `lossy` : la valeur passe dans le JSON sous une forme équivalente mais
 *   pas identique (propriété `undefined` omise, `-0` écrit `0`). L'export
 *   continue et embarque l'avertissement.
 * - `unserializable` : la valeur n'a pas de forme JSON fidèle (`Date`,
 *   `Blob`, `Map`, `NaN`, `Infinity`, `bigint`, fonction, symbole, objet
 *   d'une autre classe). L'export est **refusé** : une sauvegarde qui ne
 *   restaurerait pas la même chose n'en est pas une.
 */

export type SerializationIssueKind =
  | "undefined_property"
  | "undefined_in_array"
  | "negative_zero"
  | "non_finite_number"
  | "bigint"
  | "function"
  | "symbol"
  | "date"
  | "binary"
  | "map_or_set"
  | "foreign_object";

export interface SerializationIssue {
  store: string;
  /** Clé primaire de l'enregistrement, si lisible. */
  id: string | undefined;
  /** Chemin dans l'enregistrement, ex. `blocks[2].series[0].rpe`. */
  path: string;
  kind: SerializationIssueKind;
  severity: "lossy" | "unserializable";
}

const LOSSY: ReadonlySet<SerializationIssueKind> = new Set(["undefined_property", "undefined_in_array", "negative_zero"]);

function severityOf(kind: SerializationIssueKind): SerializationIssue["severity"] {
  return LOSSY.has(kind) ? "lossy" : "unserializable";
}

function classify(value: unknown): SerializationIssueKind | undefined {
  switch (typeof value) {
    case "string":
    case "boolean":
      return undefined;
    case "number":
      if (!Number.isFinite(value)) return "non_finite_number";
      if (Object.is(value, -0)) return "negative_zero";
      return undefined;
    case "bigint":
      return "bigint";
    case "function":
      return "function";
    case "symbol":
      return "symbol";
    case "undefined":
      return "undefined_property";
    case "object": {
      if (value === null || Array.isArray(value)) return undefined;
      if (value instanceof Date) return "date";
      if (value instanceof Map || value instanceof Set) return "map_or_set";
      if (
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value) ||
        (typeof Blob !== "undefined" && value instanceof Blob)
      ) {
        return "binary";
      }
      const proto = Object.getPrototypeOf(value) as object | null;
      if (proto !== Object.prototype && proto !== null) return "foreign_object";
      return undefined;
    }
  }
}

function walk(value: unknown, path: string, push: (path: string, kind: SerializationIssueKind) => void): void {
  const kind = classify(value);

  if (kind !== undefined) {
    push(path, kind);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item === undefined) push(`${path}[${index}]`, "undefined_in_array");
      else walk(item, `${path}[${index}]`, push);
    });
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      walk(item, path ? `${path}.${key}` : key, push);
    }
  }
}

/** Inspecte tous les enregistrements d'un store. */
export function auditStore(store: string, records: unknown[]): SerializationIssue[] {
  const issues: SerializationIssue[] = [];

  records.forEach((record, index) => {
    const id =
      record !== null && typeof record === "object" && typeof (record as { id?: unknown }).id === "string"
        ? (record as { id: string }).id
        : undefined;

    walk(record, "", (path, kind) => {
      issues.push({ store, id, path: path || `[${index}]`, kind, severity: severityOf(kind) });
    });
  });

  return issues;
}

export function auditStores(stores: Record<string, unknown[]>): SerializationIssue[] {
  return Object.entries(stores).flatMap(([store, records]) => auditStore(store, records));
}

const KIND_LABELS: Record<SerializationIssueKind, string> = {
  undefined_property: "propriété indéfinie (omise dans le fichier)",
  undefined_in_array: "élément indéfini dans un tableau (écrit null)",
  negative_zero: "zéro négatif (écrit 0)",
  non_finite_number: "nombre non fini (NaN ou infini)",
  bigint: "entier long (bigint)",
  function: "fonction",
  symbol: "symbole",
  date: "objet Date",
  binary: "données binaires",
  map_or_set: "Map ou Set",
  foreign_object: "objet d'une classe inconnue",
};

export function describeIssue(issue: SerializationIssue): string {
  return `${issue.store}${issue.id ? ` · ${issue.id}` : ""} · ${issue.path} : ${KIND_LABELS[issue.kind]}`;
}
