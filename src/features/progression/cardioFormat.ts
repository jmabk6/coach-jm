import { formatSeconds } from "../workout/workoutRecap";
import type { CardioExerciseReport, ComparableStepGroup, DurationComparableTrend } from "./cardio";
import { formatRange } from "./cardio";
import type { CardioKind } from "./exerciseNature";
import { formatDurationTotal } from "./progressionFormat";
import { formatTrendPercent, type TrendDirection, type TrendStatus } from "./trends";

/**
 * Libellés de l'onglet Cardio : tout est lu depuis le rapport du moteur,
 * rien n'est recalculé ici.
 */

const km = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const cardioKindLabels: Record<CardioKind, string> = {
  steps: "Paliers",
  duration_distance: "Durée + distance",
  distance: "Distance seule",
};

export function formatKm(distanceKm: number): string {
  return `${km.format(distanceKm)} km`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * Le mot qui accompagne une tendance directionnelle : `amélioration`
 * quand une métrique « plus bas est mieux » baisse (allure, BPM), rien
 * sinon — la couleur et le signe suffisent (§16).
 */
export function trendWord(status: TrendStatus, direction: TrendDirection): string | undefined {
  if (direction !== "lower-is-better") return undefined;
  if (status === "up") return "amélioration";
  if (status === "down") return "dégradation";

  return undefined;
}

/** `+4 % sur la période · 5 réalisations comparables` ou `2 réalisations comparables sur 3`. */
export function describeDurationTrend(trend: DurationComparableTrend): { text: string; status?: TrendStatus } {
  if (trend.percent === undefined || trend.status === undefined) {
    return { text: `${plural(trend.count, "réalisation comparable", "réalisations comparables")} sur ${trend.required}` };
  }

  const word = trendWord(trend.status, trend.direction);

  return {
    text: `${formatTrendPercent(trend.percent)}${word ? ` · ${word}` : ""} sur la période · ${plural(trend.count, "réalisation comparable", "réalisations comparables")}`,
    status: trend.status,
  };
}

/** `4 occurrences · −5 % · amélioration` ou `2 occurrences sur 3`. */
export function describeStepGroup(group: ComparableStepGroup): { text: string; status?: TrendStatus } {
  const occurrences = plural(group.occurrences.length, "occurrence");
  const withBpm = group.bpmPoints.length;

  if (group.percent === undefined || group.status === undefined) {
    return {
      text: `${occurrences} · ${withBpm < group.required ? `${withBpm} avec BPM sur ${group.required}` : `${withBpm} avec BPM`}`,
    };
  }

  const word = trendWord(group.status, "lower-is-better");

  return {
    text: `${occurrences} · ${withBpm} avec BPM · ${formatTrendPercent(group.percent)}${word ? ` · ${word}` : ""}`,
    status: group.status,
  };
}

/** Les totaux de la période, seulement ceux qui existent. */
export function describeTotals(report: CardioExerciseReport): Array<{ value: string; label: string }> {
  const items = [{ value: plural(report.totals.realisations, "réalisation"), label: "sur la période" }];

  if (report.totals.durationSec !== undefined) {
    items.push({ value: formatDurationTotal(report.totals.durationSec), label: "total sur la période" });
  }
  if (report.totals.distanceKm !== undefined) {
    items.push({ value: formatKm(report.totals.distanceKm), label: "total sur la période" });
  }

  return items;
}

/** La dernière réalisation, en une ligne : `35 min · 8 paliers`, `25 min · 12,5 km · 30 km/h`, `7 km`. */
export function describeLastLine(report: CardioExerciseReport): string {
  const last = report.last;
  const parts: string[] = [];

  if (last.durationSec !== undefined) parts.push(formatSeconds(last.durationSec));
  if (last.stepsCount !== undefined) parts.push(plural(last.stepsCount, "palier"));
  if (last.distanceKm !== undefined) parts.push(formatKm(last.distanceKm));
  if (last.speedOrPace) parts.push(last.speedOrPace);

  return parts.join(" · ");
}

/** Plages de réglages d'une réalisation en paliers — jamais une moyenne. */
export function describeRanges(report: CardioExerciseReport): string[] {
  const last = report.last;
  const parts: string[] = [];

  if (last.speedRange) parts.push(formatRange(last.speedRange, "km/h"));
  if (last.inclineRange) parts.push(formatRange(last.inclineRange, "%"));
  if (last.distanceRange) parts.push(formatRange(last.distanceRange, "km"));

  return parts;
}

/** `116 bpm moyen · 8 sur 8 paliers`, ou la couverture seule sous le seuil. */
export function describeBpm(report: CardioExerciseReport): { text: string; average: boolean } | undefined {
  const last = report.last;

  if (last.bpm) {
    return { text: `${Math.round(last.bpm.average)} bpm moyen · ${last.bpm.count} sur ${last.bpm.total} paliers`, average: true };
  }
  if (last.bpmCoverage && last.bpmCoverage.count > 0) {
    const total = plural(last.bpmCoverage.total, "palier");
    return {
      text: `BPM sur ${last.bpmCoverage.count} des ${total} · moyenne sous le seuil`,
      average: false,
    };
  }
  if (last.bpmValue !== undefined) {
    return { text: `${last.bpmValue} bpm`, average: false };
  }

  return undefined;
}
