import { formatDayLabel } from "../../domain/rules/programRules";

/** `lun. 5 oct.` : le jour court d'une mesure (carte de l'Accueil, liste). */
export function shortDayOf(date: string): string {
  const { weekday, day } = formatDayLabel(date);
  return `${weekday.toLowerCase()} ${day}`;
}
