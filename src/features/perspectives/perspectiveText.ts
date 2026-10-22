import { PACE_KNOWN_FROM, PROVISIONAL_BELOW, type WeekStatus } from "../../domain/rules/progressionRules";
import { formatPlan } from "./dayTargetFormat";
import type { PerspectiveStatus, PerspectiveView, WeekRowStatus } from "./perspectiveView";

/** Libellés des situations (lot P3). */
export function statusLabel(status: PerspectiveStatus | WeekStatus | WeekRowStatus): string {
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
    case "in_session":
      return "Séance en cours";
  }
}

/**
 * La prévision au 31 mars en une phrase : la séance probable (chaque
 * série) et la mention « provisoire » avec ce qui permettra de l'affiner.
 * La fourchette est à part (`forecastRange`), dans le détail.
 */
export function forecastText(view: PerspectiveView, options: { perDumbbell?: boolean; assistance?: boolean }): string {
  if (view.track.suspension) return "Prévision au 31 mars : suspendue avec la progression.";
  if (view.track.engine === "v6") return "Prévision : paliers de 7 kg d’aide vers la première traction stricte, à affiner séance après séance.";
  if (!view.last) return "Prévision à affiner : elle démarrera après la première séance.";
  const forecast = view.forecast;
  if (!forecast) {
    const weeks = view.paceWeeks ?? 0;
    return weeks < PACE_KNOWN_FROM
      ? `Prévision à affiner : rythme encore inconnu (${weeks} semaine${weeks > 1 ? "s" : ""} avec séance sur les ${PACE_KNOWN_FROM} nécessaires) ; seul l’objectif de la prochaine séance est donné.`
      : "Prévision à affiner.";
  }
  const base = `31 mars : ${formatPlan(forecast.probable, options.perDumbbell ?? false)}`;
  /* Historique insuffisant : « provisoire » d'abord, même quand le rythme est encore nul. */
  if (forecast.provisional) {
    const weeks = forecast.weeksWithSession;
    return `${base} — provisoire : historique encore insuffisant (${weeks} semaine${weeks > 1 ? "s" : ""} avec séance sur les ${PROVISIONAL_BELOW} nécessaires).`;
  }
  if (forecast.paceWeekly === 0) return `${base} — stable pour l’instant : à affiner dès que tes séances progressent.`;
  return base;
}

/** La fourchette au 31 mars (rythme × 0,4 et × 1,3), série par série ; absente si elle se confond avec la prévision. */
export function forecastRange(view: PerspectiveView, options: { perDumbbell?: boolean }): { low: string; high: string } | undefined {
  if (!view.forecast || view.track.suspension) return undefined;
  const perDumbbell = options.perDumbbell ?? false;
  const low = formatPlan(view.forecast.low, perDumbbell);
  const high = formatPlan(view.forecast.high, perDumbbell);
  return low === high ? undefined : { low, high };
}

/** « 26 oct. » : le lundi d'une semaine. */
export function formatWeek(monday: string): string {
  const [year, month, day] = monday.split("-").map(Number) as [number, number, number];
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${day === 1 ? "1er" : day} ${months[month - 1]}${year !== 2026 ? ` ${year}` : ""}`;
}
