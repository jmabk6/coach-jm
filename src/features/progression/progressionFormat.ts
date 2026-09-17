import { formatSeconds } from "../workout/workoutRecap";
import type { TrendMetric } from "./trends";

/** `45 min`, `1 h`, `10 h 12` : durée totale d'activité, agrégat neutre. */
export function formatDurationTotal(sec: number): string {
  const minutes = Math.round(sec / 60);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

const kg = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Valeur d'une métrique de tendance avec son unité : `47,5 kg`, `12 reps`, `1 min 20 s`. */
export function formatMetricValue(metric: TrendMetric, value: number): string {
  switch (metric) {
    case "chargeMax":
    case "volume":
      return `${kg.format(value)} kg`;
    case "reps":
      return `${value} reps`;
    case "durationMax":
      return formatSeconds(value);
  }
}
