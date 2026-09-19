export function canonicalStringify(value: unknown): string;
export function sha256Hex(text: string): string;
export function verifyBackup(envelope: unknown): {
  ok: boolean;
  problems: string[];
  notes: string[];
  computed: string | undefined;
};
