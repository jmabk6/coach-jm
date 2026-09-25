import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Date en français avec « 1er » pour le premier jour du mois (décision du
 * 25/09/2026) : « 1er oct. », « jeudi 1er octobre 2026 », « Du 1er au
 * 7 novembre ». Le motif est celui de date-fns ; seul le jeton `d` (jour
 * du mois, sans zéro) est concerné.
 */
export function formatFr(date: Date | string, pattern: string): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  const withFirst = value.getDate() === 1 ? pattern.replace(/(^|[^A-Za-z'])d(?![A-Za-z])/g, "$1'1er'") : pattern;
  return format(value, withFirst, { locale: fr });
}
