export function canonicalStringify(value: unknown): string;
export function sha256Hex(text: string): string;
export function verifyBackup(envelope: unknown): {
  ok: boolean;
  problems: string[];
  notes: string[];
  computed: string | undefined;
  legacyHash: string | undefined;
  storeHashes?: Record<string, string>;
};
/** I-10 à I-13 (SCHEMA § 8.2, T-19) : un écart par ligne, préfixé par son invariant. */
export function checkTestLinks(stores: Record<string, unknown[]>): string[];
export function primaryKeyOf(store: string): string;
export function storeHashesOf(stores: Record<string, unknown[]>): Record<string, string>;
export function compareBackups(
  before: { stores?: Record<string, unknown[]> },
  after: { stores?: Record<string, unknown[]> },
): Array<{
  store: string;
  identical: boolean;
  presence?: "absent avant" | "absent après";
  added: string[];
  removed: string[];
  modified: string[];
}>;
