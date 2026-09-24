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
