import { PROVISIONAL_BELOW, type WeekStatus } from "../../domain/rules/progressionRules";
import { formatSetTarget } from "./dayTargetFormat";
import type { PerspectiveStatus, PerspectiveView } from "./perspectiveView";

/** Libellés des situations (lot P3). */
export function statusLabel(status: PerspectiveStatus | WeekStatus): string {
  switch (status) {
    case "ahead":
      return "En avance";
    case "on_track":
      return "Dans la trajectoire";
    case "consolidate":
      return "Palier à consolider";
    case "insufficient":
      return "Données insuffisantes";
    case "suspended":
      return "Progression suspendue";
    case "missed":
      return "Non faite";
    case "upcoming":
      return "À venir";
  }
}

/**
 * La prévision au 31 mars en une phrase : fourchette, probable, et la
 * mention « provisoire » avec ce qui permettra de l'affiner.
 */
export function forecastText(view: PerspectiveView, options: { perDumbbell?: boolean; assistance?: boolean }): string {
  if (view.track.suspension) return "Prévision au 31 mars : suspendue avec la progression.";
  if (view.track.engine === "v6") return "Prévision : paliers de 7 kg d’aide vers la première traction stricte, à affiner séance après séance.";
  if (!view.last) return "Prévision à affiner : elle démarrera après la première séance.";
  const forecast = view.forecast;
  if (!forecast) return "Prévision à affiner.";
  const low = formatSetTarget(forecast.low, options);
  const high = formatSetTarget(forecast.high, options);
  const probable = formatSetTarget(forecast.probable, options);
  const range = low === high ? probable : `${low} à ${high}`;
  const base = `31 mars : ${range}${low === high ? "" : ` (probable ${probable})`}`;
  /* Historique insuffisant : « provisoire » d'abord, même quand le rythme est encore nul. */
  if (forecast.provisional) {
    const weeks = forecast.weeksWithSession;
    return `${base} — provisoire : historique encore insuffisant (${weeks} semaine${weeks > 1 ? "s" : ""} avec séance sur les ${PROVISIONAL_BELOW} nécessaires).`;
  }
  if (forecast.paceWeekly === 0) return `${base} — stable pour l’instant : à affiner dès que tes séances progressent.`;
  return base;
}

/** « 26 oct. » : le lundi d'une semaine. */
export function formatWeek(monday: string): string {
  const [year, month, day] = monday.split("-").map(Number) as [number, number, number];
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${day === 1 ? "1er" : day} ${months[month - 1]}${year !== 2026 ? ` ${year}` : ""}`;
}
