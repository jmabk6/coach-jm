/**
 * Forme canonique d'une valeur JSON et empreinte SHA-256 (conception
 * sauvegarde lot 0, § 4). La même règle vit dans `scripts/backup-canonical.mjs`
 * pour la vérification hors appareil ; un test garantit que les deux
 * implémentations coïncident.
 *
 * Règle `sorted-keys-json-v1` : clés d'objet triées par code point,
 * aucun espace, `undefined` omis (comme `JSON.stringify`), tableaux dans
 * l'ordre. Elle signe les données, pas la mise en forme.
 */

export const CANONICAL_RULE = "sorted-keys-json-v1";

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalStringify(item))).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Empreinte d'une valeur sous sa forme canonique. */
export async function hashCanonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}
