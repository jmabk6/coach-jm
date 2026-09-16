import type {
  Exercise,
  Id,
  Load,
  PerformedBlock,
  PerformedCardioStep,
  PerformedSeries,
  WorkoutSession,
} from "../../domain";
import { calculateVolume, getLoadKg } from "../../domain/rules/workoutRules";

/**
 * Récapitulatif d'une réalisation (§14), en lecture : cartes de tête,
 * puis une ligne par brique avec son détail série par série ou palier
 * par palier. Aucune confrontation au prévu ici — elle viendra avec
 * l'Étape 7.
 */

/* -------------------------------------------------------------------------- */
/* Formats                                                                    */
/* -------------------------------------------------------------------------- */

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function formatKg(kg: number): string {
  return `${fr.format(Math.round(kg))} kg`;
}

export function formatDecimal(value: number): string {
  return fr.format(Math.round(value * 10) / 10);
}

export function formatMinutes(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

export function formatSeconds(sec: number): string {
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * `40 kg`, `5 kg/côté`, `à vide`.
 */
export function formatLoad(load: Load | undefined): string {
  if (!load) return "—";

  switch (load.kind) {
    case "total":
      return `${fr.format(load.kg)} kg`;
    case "per_side":
      return `${fr.format(load.kgPerSide)} kg/côté`;
    case "empty":
      return load.tareKg !== undefined ? `à vide (${fr.format(load.tareKg)} kg)` : "à vide";
  }
}

/**
 * `10 kg × 12 · RPE 10 · tremblement` : la ligne d'une série, sa note
 * comprise (§14), jamais reléguée ailleurs.
 */
export function formatSeriesLine(series: PerformedSeries): string {
  const parts: string[] = [];

  if (series.load) parts.push(formatLoad(series.load));

  if (series.reps !== undefined) {
    parts.push(series.load ? `× ${series.reps}` : `${series.reps} reps`);
  }

  if (series.durationSec !== undefined) parts.push(formatSeconds(series.durationSec));

  if (series.sideValues && series.sideValues.length > 0) {
    const left = series.sideValues.find((value) => value.side === "left");
    const right = series.sideValues.find((value) => value.side === "right");
    const describe = (value: typeof left) =>
      value?.reps !== undefined
        ? `${value.reps} reps`
        : value?.durationSec !== undefined
          ? formatSeconds(value.durationSec)
          : "—";

    parts.push(
      describe(left) === describe(right)
        ? `${describe(left)} par côté`
        : `G ${describe(left)} · D ${describe(right)}`,
    );
  }

  const line = parts.join(" ");
  const extras: string[] = [];

  if (series.rpe !== undefined) extras.push(`RPE ${series.rpe}`);
  if (series.note) extras.push(series.note);

  return [line || "—", ...extras].join(" · ");
}

export function formatStepSettings(step: PerformedCardioStep): {
  duration: string;
  first: string;
  second: string;
} {
  const settings = step.settings;

  if ("speedKmh" in settings) {
    return {
      duration: formatMinutes(settings.durationSec),
      first: `${fr.format(settings.speedKmh)} km/h`,
      second: `${fr.format(settings.inclinePercent)} %`,
    };
  }

  return {
    duration: formatMinutes(settings.durationSec),
    first: `${fr.format(settings.distanceKm)} km`,
    second: "",
  };
}

/* -------------------------------------------------------------------------- */
/* Cartes de tête                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Seuil de couverture (§16) : une moyenne facultative n'est affichée
 * qu'avec au moins la moitié des valeurs et au moins cinq.
 */
const MIN_COVERAGE_RATIO = 0.5;
const MIN_COVERAGE_COUNT = 5;

export interface CoveredAverage {
  value: number;
  count: number;
  total: number;
}

function coveredAverage(
  values: (number | undefined)[],
  minCount = MIN_COVERAGE_COUNT,
): CoveredAverage | undefined {
  const known = values.filter((value): value is number => value !== undefined);

  if (
    values.length === 0 ||
    known.length < minCount ||
    known.length / values.length < MIN_COVERAGE_RATIO
  ) {
    return undefined;
  }

  return {
    value: known.reduce((sum, value) => sum + value, 0) / known.length,
    count: known.length,
    total: values.length,
  };
}

export interface WorkoutRecapHead {
  activeDurationSec: number;
  startedAt: string;
  completedAt?: string;
  volumeKg: number;
  seriesDone: number;
  rpe?: CoveredAverage;
  bpm?: { min: number; max: number; average: CoveredAverage };
  cardioSteps: number;
  cardioDurationSec: number;
  performed: number;
  skipped: number;
  notPerformed: number;
}

export function listCompletedSeries(blocks: PerformedBlock[]): PerformedSeries[] {
  const series: PerformedSeries[] = [];

  for (const block of blocks) {
    if (block.kind !== "exercise" || block.status !== "performed") continue;

    for (const item of block.series ?? []) {
      if (item.status === "completed") series.push(item);
    }
  }

  return series;
}

export function listCompletedSteps(blocks: PerformedBlock[]): PerformedCardioStep[] {
  const steps: PerformedCardioStep[] = [];

  for (const block of blocks) {
    if (block.kind !== "exercise" || block.status !== "performed") continue;

    for (const step of block.cardioSteps ?? []) {
      if (step.status === "completed") steps.push(step);
    }
  }

  return steps;
}

export function summarizeWorkout(workout: WorkoutSession): WorkoutRecapHead {
  const series = listCompletedSeries(workout.blocks);
  const steps = listCompletedSteps(workout.blocks);
  const bpmValues = steps.map((step) => step.bpm);
  const knownBpm = bpmValues.filter((value): value is number => value !== undefined);
  /* Le BPM d'un palier est facultatif (§14) : la plage et la moyenne
     portent sur les paliers renseignés, dès qu'ils sont majoritaires. */
  const bpmAverage = coveredAverage(bpmValues, 2);
  const rpeAverage = coveredAverage(series.map((item) => item.rpe));

  let performed = 0;
  let skipped = 0;
  let notPerformed = 0;

  for (const block of workout.blocks) {
    if (block.kind === "note") continue;
    if (block.status === "performed") performed += 1;
    else if (block.status === "skipped") skipped += 1;
    else notPerformed += 1;
  }

  return {
    activeDurationSec: workout.activeDurationSec,
    startedAt: workout.startedAt,
    ...(workout.completedAt ? { completedAt: workout.completedAt } : {}),
    volumeKg: calculateVolume(series),
    seriesDone: series.length,
    ...(rpeAverage ? { rpe: rpeAverage } : {}),
    ...(bpmAverage && knownBpm.length > 0
      ? {
          bpm: {
            min: Math.min(...knownBpm),
            max: Math.max(...knownBpm),
            average: bpmAverage,
          },
        }
      : {}),
    cardioSteps: steps.length,
    cardioDurationSec: steps.reduce(
      (sum, step) => sum + step.settings.durationSec,
      0,
    ),
    performed,
    skipped,
    notPerformed,
  };
}

/* -------------------------------------------------------------------------- */
/* Lignes par brique                                                          */
/* -------------------------------------------------------------------------- */

export interface WorkoutRecapLine {
  block: PerformedBlock;
  number: string;
  name: string;
  /** `3 séries`, `8 paliers · 35 min`, `7 km`, `Note`. */
  subtitle: string;
  volumeKg?: number;
  rpe?: number;
  category?: Exercise["category"];
}

export function buildWorkoutRecapLines(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): WorkoutRecapLine[] {
  const ordered = [...workout.blocks].sort((a, b) => a.position - b.position);
  let visibleNumber = 0;

  return ordered.map((block) => {
    const number = block.kind === "note" ? "" : String(++visibleNumber);

    if (block.kind === "note") {
      return { block, number, name: block.title ?? "Note", subtitle: block.text };
    }

    if (block.kind === "group") {
      const rounds = block.rounds.filter((round) => round.status === "completed");

      return {
        block,
        number,
        name: block.name ?? `Groupe ${number}`,
        subtitle: `${rounds.length} tour${rounds.length > 1 ? "s" : ""} · ${block.children.length} exercices`,
      };
    }

    const exercise = exerciseById.get(block.exerciseId);
    const name = exercise?.name ?? "Exercice supprimé";
    const series = (block.series ?? []).filter((item) => item.status === "completed");
    const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");
    const rpes = series.map((item) => item.rpe).filter((v): v is number => v !== undefined);

    if (steps.length > 0) {
      const durationSec = steps.reduce((sum, step) => sum + step.settings.durationSec, 0);

      return {
        block,
        number,
        name,
        subtitle: `${steps.length} palier${steps.length > 1 ? "s" : ""} · ${formatMinutes(durationSec)}`,
        ...(exercise ? { category: exercise.category } : {}),
      };
    }

    if (block.simpleMeasurement) {
      const measure = block.simpleMeasurement;
      const parts: string[] = [];

      if (measure.distanceKm !== undefined) parts.push(`${fr.format(measure.distanceKm)} km`);
      if (measure.durationSec !== undefined) parts.push(formatMinutes(measure.durationSec));
      if (measure.distanceCm !== undefined) parts.push(`${fr.format(measure.distanceCm)} cm`);

      return {
        block,
        number,
        name,
        subtitle: parts.join(" · ") || "Mesure simple",
        ...(exercise ? { category: exercise.category } : {}),
      };
    }

    const volume = calculateVolume(series);
    const hasLoad = series.some((item) => item.load && getLoadKg(item.load) !== undefined);

    return {
      block,
      number,
      name,
      subtitle:
        block.status === "performed"
          ? `${series.length} série${series.length > 1 ? "s" : ""}`
          : block.status === "skipped"
            ? "Sauté"
            : "Non réalisé",
      ...(hasLoad && volume > 0 ? { volumeKg: volume } : {}),
      ...(rpes.length > 0
        ? { rpe: rpes.reduce((sum, value) => sum + value, 0) / rpes.length }
        : {}),
      ...(exercise ? { category: exercise.category } : {}),
    };
  });
}
