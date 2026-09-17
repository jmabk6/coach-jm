/**
 * `42,5` → 42.5 ; vide ou illisible → undefined.
 */
export function parseNumber(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");

  if (normalized === "") return undefined;

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatNumberInput(value: number | undefined): string {
  if (value === undefined) return "";

  return String(Math.round(value * 100) / 100).replace(".", ",");
}
