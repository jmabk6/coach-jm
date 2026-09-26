import type { Exercise, PerformedSeries, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { formatDurationShort } from "../../domain/rules/blockInstructionRules";
import { formatFr } from "../../domain/rules/dateFr";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { formatStrengthValue } from "../../domain/rules/strengthRules";
import { getLoadKg } from "../../domain/rules/workoutRules";
import { advisedLoadOf, formatAdvisedLoad } from "../workout/advisedLoad";
import type { ExercisePerformanceEntry, ExercisePerformanceMetric, ExercisePerformanceSummary } from "./exercisePerformance";

/**
 * Contenu de la fiche exercice refondue (maquette du 26/09/2026) :
 * fonctions pures, lues par `ExerciseDetailScreen`.
 */

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/* -------------------------------------------------------------------------- */
/* Prochaine séance                                                           */
/* -------------------------------------------------------------------------- */

export interface NextSession {
  /** « 52 kg d'assistance », « 35 kg (barre + 7,5 kg de chaque côté) », « Charge à trouver ». */
  headline: string;
  /** « 3 × 6–8 · RPE ≤ 8 · repos 2 min 30 », ou « Légère, pour 3 × 12–15 à RPE 8. Repos 1 min 30. » */
  details?: string;
  /** La règle du cadre en une phrase ; absente sans cadre. */
  rule?: string;
  toFind: boolean;
}

function prescription(version: StrengthFrameVersion): string {
  if (version.progressionType === "duree_croissante") {
    return `${version.workSets} × ${version.targetDurationSec !== undefined ? formatDurationShort(version.targetDurationSec) : "durée"}`;
  }
  return version.repRange ? `${version.workSets} × ${version.repRange.min}–${version.repRange.max}` : `${version.workSets} séries`;
}

/** La règle du cadre en une phrase (conception v1.6 § 4.2 bis). */
export function frameRuleSentence(version: StrengthFrameVersion): string {
  const rpe = version.rpeTarget !== undefined ? ` à RPE ≤ ${version.rpeTarget}` : "";
  const top = version.repRange?.max;

  switch (version.progressionType) {
    case "assistance_decroissante":
      return `Un cran d'aide en moins quand tu réussis ${version.workSets} × ${top ?? "toutes les répétitions"}${rpe}.`;
    case "duree_croissante": {
      const step = version.increment ? `+ ${formatStrengthValue(version.increment.value, "sec")}` : "Un peu plus longtemps";
      return `${step} quand toutes les séries tiennent la durée${rpe}.`;
    }
    case "charge_croissante": {
      if (!version.increment) return `Charge à monter quand toutes les séries atteignent ${top ?? "le haut de la plage"} répétitions${rpe}.`;
      return `+ ${formatStrengthValue(version.increment.value, "kg")} quand toutes les séries atteignent ${top ?? "le haut de la plage"} répétitions${rpe}.`;
    }
  }
}

/**
 * « Prochaine séance » : la charge **conseillée** par le cadre (objectif
 * accepté, sinon dernière séance), sa prescription et sa règle ; sans
 * cible ni historique, « Charge à trouver ». Sans cadre : la dernière
 * charge de travail, s'il y en a une ; sinon rien.
 */
export function nextSessionOf(
  exercise: Exercise,
  version: StrengthFrameVersion | undefined,
  lastSeries: ReadonlyArray<PerformedSeries> | undefined,
): NextSession | undefined {
  const advised = advisedLoadOf(exercise, version, lastSeries);

  if (!version) {
    return advised ? { headline: formatAdvisedLoad(advised), details: "D'après ta dernière séance.", toFind: false } : undefined;
  }

  const rest = `repos ${formatDurationShort(version.restSec)}`;
  const rpe = version.rpeTarget !== undefined ? `RPE ≤ ${version.rpeTarget}` : undefined;

  if (!advised) {
    const target = version.rpeTarget !== undefined ? ` à RPE ${version.rpeTarget}` : "";
    return {
      headline: version.progressionType === "duree_croissante" ? "Durée à trouver" : "Charge à trouver",
      details: `Légère, pour ${prescription(version)}${target}. ${rest[0]!.toUpperCase()}${rest.slice(1)}.`,
      rule: frameRuleSentence(version),
      toFind: true,
    };
  }

  return {
    headline: formatAdvisedLoad(advised),
    details: [prescription(version), rpe, rest].filter(Boolean).join(" · "),
    rule: frameRuleSentence(version),
    toFind: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Dernières séances                                                          */
/* -------------------------------------------------------------------------- */

export interface SessionRow {
  workoutId: string;
  /** « 25 sept. » */
  date: string;
  /** « 49 kg », « 49 / 49 / 56 kg », « 45 s », ou vide sans charge. */
  load: string;
  /** « 8 / 8 / 8 » */
  reps: string;
  /** « RPE 8-8-9 », « — » sans RPE. */
  rpe: string;
}

function joinSame(values: string[], unit: string): string {
  if (values.length === 0) return "";
  const unique = new Set(values);
  return unique.size === 1 ? `${values[0]} ${unit}` : `${values.join(" / ")} ${unit}`;
}

/** Toutes les séances de l'exercice, séries et RPE réels, la plus récente d'abord. */
export function sessionRowsOf(entries: ReadonlyArray<ExercisePerformanceEntry>): SessionRow[] {
  return entries.map((entry) => {
    const series = entry.series;
    const loads = series.map((item) => getLoadKg(item.load)).filter((kg): kg is number => kg !== undefined).map((kg) => number.format(kg));
    const reps = series
      .map((item) => item.reps ?? item.sideValues?.map((side) => side.reps).find((value) => value !== undefined))
      .filter((value): value is number => value !== undefined);
    const durations = series
      .map((item) => item.durationSec ?? item.sideValues?.map((side) => side.durationSec).find((value) => value !== undefined))
      .filter((value): value is number => value !== undefined);
    const rpes = series.map((item) => item.rpe).filter((value): value is number => value !== undefined);

    return {
      workoutId: entry.workoutId,
      date: formatFr(entry.date, "d MMM"),
      load: loads.length > 0 ? joinSame(loads, "kg") : durations.length > 0 && reps.length === 0 ? joinSame(durations.map(String), "s") : "",
      reps: reps.length > 0 ? reps.join(" / ") : durations.length > 0 && loads.length > 0 ? durations.map((sec) => `${sec} s`).join(" / ") : "",
      rpe: rpes.length > 0 ? `RPE ${rpes.map((value) => number.format(value)).join("-")}` : "—",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Cardio : durée, vitesse, pente, FC                                          */
/* -------------------------------------------------------------------------- */

export interface CardioRow {
  workoutId: string;
  date: string;
  duration: string;
  /** « 5 km/h », « 5–6 km/h », ou une distance. */
  speed: string;
  incline: string;
  /** « 150 bpm » (le plus haut relevé), ou « — ». */
  bpm: string;
}

function range(values: number[], unit: string): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${number.format(min)} ${unit}` : `${number.format(min)}–${number.format(max)} ${unit}`;
}

/** Les séances d'un exercice cardio, paliers validés ou mesure simple ; la plus récente d'abord. */
export function cardioRowsOf(exercise: Exercise, workouts: ReadonlyArray<WorkoutSession>): CardioRow[] {
  const rows: Array<CardioRow & { startedAt: string }> = [];

  for (const workout of workouts) {
    if (workout.status !== "completed") continue;
    for (const block of workout.blocks) {
      if (block.kind !== "exercise" || block.exerciseId !== exercise.id || block.status !== "performed") continue;

      const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");
      const measure = block.simpleMeasurement;
      if (steps.length === 0 && !measure) continue;

      const durationSec =
        steps.reduce((sum, step) => sum + step.settings.durationSec, 0) + (measure?.durationSec ?? 0);
      const speeds = steps.flatMap((step) => ("speedKmh" in step.settings ? [step.settings.speedKmh] : []));
      const inclines = steps.flatMap((step) => ("inclinePercent" in step.settings ? [step.settings.inclinePercent] : []));
      const distanceKm =
        steps.reduce((sum, step) => sum + ("distanceKm" in step.settings ? (step.settings.distanceKm ?? 0) : 0), 0) + (measure?.distanceKm ?? 0);
      const bpms = [...steps.map((step) => step.bpm), measure?.bpm].filter((value): value is number => value !== undefined);

      rows.push({
        workoutId: workout.id,
        startedAt: workout.startedAt,
        date: formatFr(workout.date, "d MMM"),
        duration: durationSec > 0 ? formatDurationShort(durationSec) : "—",
        speed: speeds.length > 0 ? range(speeds, "km/h") : distanceKm > 0 ? `${number.format(distanceKm)} km` : "—",
        incline: range(inclines, "%") || "—",
        bpm: bpms.length > 0 ? `${Math.max(...bpms)} bpm` : "—",
      });
    }
  }

  return rows
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((row) => ({ workoutId: row.workoutId, date: row.date, duration: row.duration, speed: row.speed, incline: row.incline, bpm: row.bpm }));
}

/* -------------------------------------------------------------------------- */
/* Graphique et meilleure série                                               */
/* -------------------------------------------------------------------------- */

export interface ChartSpec {
  title: string;
  /** Sens lu sur le graphique : la courbe monte quand on progresse. */
  better: string;
  /** Axe inversé : une assistance (ou une distance) qui baisse fait monter la courbe. */
  reversed: boolean;
  unit: string;
}

export function chartSpecOf(exercise: Exercise, metric: ExercisePerformanceMetric): ChartSpec {
  switch (metric) {
    case "chargeMax":
      return loadSemanticsOf(exercise) === "assistance"
        ? { title: "Évolution de l'assistance", better: "Moins d'aide = mieux", reversed: true, unit: "kg" }
        : { title: "Évolution de la charge", better: "Plus lourd = mieux", reversed: false, unit: "kg" };
    case "volume":
      return { title: "Évolution du volume", better: "Plus = mieux", reversed: false, unit: "kg" };
    case "reps":
      return { title: "Évolution des répétitions", better: "Plus = mieux", reversed: false, unit: "" };
    case "durationMax":
      return { title: "Évolution de la durée", better: "Plus long = mieux", reversed: false, unit: "s" };
    case "distanceCm":
      return { title: "Évolution de la distance", better: "Moins = mieux", reversed: true, unit: "cm" };
    case "powerMax":
      return { title: "Évolution du résultat", better: "Plus = mieux", reversed: false, unit: exercise.powerUnit === "meters" ? "m" : "W" };
  }
}

/**
 * « 10 répétitions à 49 kg », « 45 s », « 15 répétitions » : la meilleure
 * série de la meilleure séance, avec sa vraie date.
 */
export function bestSeriesOf(summary: ExercisePerformanceSummary): { text: string; date: string } {
  const { metric, bestValue, bestEntry } = summary;
  const date = formatFr(bestEntry.date, "d MMM yyyy");

  if (metric === "chargeMax") {
    const reps =
      bestEntry.repsAtBestLoad ??
      Math.max(
        0,
        ...bestEntry.series.filter((item) => getLoadKg(item.load) === bestValue).map((item) => item.reps ?? 0),
      );
    const kg = `${number.format(bestValue)} kg`;
    return { text: reps > 0 ? `${reps} répétition${reps > 1 ? "s" : ""} à ${kg}` : kg, date };
  }
  if (metric === "reps") return { text: `${bestValue} répétition${bestValue > 1 ? "s" : ""}`, date };
  if (metric === "durationMax") return { text: formatDurationShort(bestValue), date };
  if (metric === "distanceCm") return { text: `${number.format(bestValue)} cm`, date };
  if (metric === "powerMax") return { text: `${number.format(bestValue)} ${bestEntry.powerUnit === "meters" ? "m" : "W"}`, date };
  return { text: `${number.format(bestValue)} kg`, date };
}

/* -------------------------------------------------------------------------- */
/* Comment faire                                                              */
/* -------------------------------------------------------------------------- */

/** Un texte en points : une phrase par point (3 à 4 dans le catalogue). */
export function sentencesOf(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Étiquettes de l'en-tête, sans doublon (zone, mouvement, matériel ; ou catégorie, matériel, lieu). */
export function headerTagsOf(exercise: Exercise): string[] {
  const values =
    exercise.category === "Musculation"
      ? [exercise.zone, exercise.movement, exercise.equipment]
      : exercise.category === "Cardio"
        ? [exercise.category, exercise.equipment, exercise.location]
        : [exercise.category, exercise.location];
  return [...new Set(values.filter((value): value is NonNullable<typeof value> => Boolean(value)))];
}
