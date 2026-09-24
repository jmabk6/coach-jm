import { db } from "../../db/database";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getGoalByKey } from "../../db/repositories/goalRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import { getAllTestProtocols, getAllTestResults, getTestProtocolVersion } from "../../db/repositories/testRepository";
import { getWeightEntries } from "../../db/repositories/weightRepository";
import type { Exercise, Goal, GoalKey, GoalSecondaryIndicator, TestProtocol, TestProtocolVersion, TestResult, WorkoutSession } from "../../domain";
import { goalProtocolId, nextTestDate } from "../../domain/rules/goalListRules";
import { measureValue } from "../../domain/rules/goalRules";
import { formatTestNumber } from "../../domain/rules/testResultRules";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  isLowerBetterMetric,
  type ExercisePerformanceEntry,
  type ExercisePerformanceMetric,
} from "../exercises/exercisePerformance";
import { goalProgressFrom, type GoalProgress } from "./goalProgress";

/**
 * M5 — Objectif > Progression (lot H.4). La courbe et les cartes ne lisent
 * que les résultats de test et les pesées (goalProgress) ; les indicateurs
 * secondaires et les séances liées, eux, lisent l'entraînement — ils ne
 * sont jamais tracés sur la courbe.
 */

export interface SecondaryCard {
  label: string;
  /** Meilleure valeur depuis le début de l'historique, ou `undefined` : « À mesurer ». */
  best?: string;
  /** Ce que mesure la carte (« Meilleure série », « Durée maximale »). */
  caption: string;
  /** Écart entre la meilleure valeur et la première (« +5 kg »), si elle a progressé. */
  gain?: string;
  /** Date de la première valeur. */
  since?: string;
}

export interface LinkedSession {
  workoutId: string;
  date: string;
  /** « Tirage vertical : 45 kg × 7 », un par exercice lié réellement fait. */
  lines: string[];
}

export interface GoalDetail {
  goal: Goal;
  progress: GoalProgress;
  protocol?: TestProtocol;
  version?: TestProtocolVersion;
  formatValue: (value: number) => string;
  nextTest?: string;
  secondary: SecondaryCard[];
  linkedSessions: LinkedSession[];
}

const METRIC_CAPTIONS: Record<ExercisePerformanceMetric, string> = {
  chargeMax: "Meilleure série",
  volume: "Meilleur volume",
  reps: "Répétitions max",
  durationMax: "Durée maximale",
  distanceCm: "Meilleure distance",
  powerMax: "Puissance max",
};

function formatMetric(metric: ExercisePerformanceMetric, value: number, entry?: ExercisePerformanceEntry): string {
  switch (metric) {
    case "chargeMax": {
      const reps = entry?.repsAtBestLoad ?? bestRepsAt(entry, value);
      return reps ? `${formatTestNumber(value)} kg × ${reps}` : `${formatTestNumber(value)} kg`;
    }
    case "volume":
      return `${formatTestNumber(value)} kg`;
    case "reps":
      return `${value} reps`;
    case "durationMax":
      return `${formatTestNumber(value)} s`;
    case "distanceCm":
      return `${formatTestNumber(value)} cm`;
    case "powerMax":
      return `${formatTestNumber(value)} ${entry?.powerUnit === "meters" ? "m" : "W"}`;
  }
}

function bestRepsAt(entry: ExercisePerformanceEntry | undefined, kg: number): number | undefined {
  const reps = (entry?.series ?? [])
    .filter((series) => series.load && "kg" in series.load && series.load.kg === kg)
    .map((series) => series.reps ?? 0);
  return reps.length > 0 ? Math.max(...reps) : undefined;
}

function signed(value: number, unit: string): string {
  return `${value > 0 ? "+" : "−"}${formatTestNumber(Math.abs(value))}${unit}`;
}

function exerciseCard(
  indicator: Extract<GoalSecondaryIndicator, { kind: "exercise" }>,
  exercise: Exercise | undefined,
  workouts: WorkoutSession[],
): SecondaryCard {
  const label = exercise?.name ?? "Exercice supprimé";
  const caption = METRIC_CAPTIONS[indicator.metric];
  if (!exercise) return { label, caption };

  const history = buildExercisePerformanceHistory(exercise, workouts);
  const semantics = loadSemanticsOf(exercise);
  const summary = buildExercisePerformanceSummary(history, indicator.metric, semantics);
  if (!summary) return { label, caption };

  const lowerBetter = isLowerBetterMetric(indicator.metric, semantics);
  const delta = summary.bestValue - summary.firstValue;
  const improved = lowerBetter ? delta < 0 : delta > 0;
  const unit = indicator.metric === "chargeMax" || indicator.metric === "volume" ? " kg" : indicator.metric === "durationMax" ? " s" : "";
  /* L'historique est du plus récent au plus ancien : la première séance est la dernière. */
  const first = history[history.length - 1];

  return {
    label,
    caption,
    best: formatMetric(indicator.metric, summary.bestValue, summary.bestEntry),
    ...(improved ? { gain: signed(delta, unit) } : {}),
    ...(first ? { since: first.date } : {}),
  };
}

function measureCard(
  indicator: Extract<GoalSecondaryIndicator, { kind: "test_measure" }>,
  version: TestProtocolVersion | undefined,
  results: TestResult[],
): SecondaryCard {
  const spec = version?.measures.find((measure) => measure.key === indicator.measureKey);
  const label = spec?.label ?? indicator.measureKey;
  const values = results
    .filter((result) => result.protocolId === indicator.protocolId)
    .map((result) => ({ date: result.date, value: measureValue(result, indicator.measureKey, undefined) }))
    .filter((item): item is { date: string; value: number } => item.value !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (values.length === 0) return { label, caption: "Résultat de test" };

  const unit = spec?.unit ? ` ${spec.unit}` : "";
  /* Sens de la mesure inconnu ici : la meilleure est la plus récente, l'écart celui depuis la première. */
  const latest = values[values.length - 1]!;
  const delta = latest.value - values[0]!.value;
  return {
    label,
    caption: "Dernier résultat de test",
    best: `${formatTestNumber(latest.value)}${unit}`,
    ...(values.length > 1 && delta !== 0 ? { gain: signed(delta, unit) } : {}),
    since: values[0]!.date,
  };
}

/** Séances liées (M5) : les 10 dernières qui contiennent un exercice lié, échauffements exclus (N10). */
export function linkedSessionsOf(goal: Goal, workouts: WorkoutSession[], exerciseById: Map<string, Exercise>): LinkedSession[] {
  const linked = new Set(goal.linkedExercises.map((item) => item.exerciseId));
  if (linked.size === 0) return [];

  return workouts
    .filter((workout) => workout.status === "completed")
    .map((workout): LinkedSession => {
      const done = new Set<string>();
      for (const block of workout.blocks) {
        if (block.kind === "exercise" && block.role !== "warmup" && block.status === "performed" && linked.has(block.exerciseId)) {
          done.add(block.exerciseId);
        }
        if (block.kind === "group" && block.status === "performed") {
          for (const round of block.rounds) {
            for (const child of round.children) {
              if (child.completedAt !== undefined && linked.has(child.exerciseId)) done.add(child.exerciseId);
            }
          }
        }
      }
      const lines = [...done].map((exerciseId) => {
        const exercise = exerciseById.get(exerciseId);
        if (!exercise) return "Exercice supprimé";
        const entry = buildExercisePerformanceHistory(exercise, [workout])[0];
        const detail = entry ? entrySummary(entry) : undefined;
        return detail ? `${exercise.name} : ${detail}` : exercise.name;
      });
      return { workoutId: workout.id, date: workout.date, lines };
    })
    .filter((session) => session.lines.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
}

function entrySummary(entry: ExercisePerformanceEntry): string | undefined {
  if (entry.chargeMaxKg !== undefined) return formatMetric("chargeMax", entry.chargeMaxKg, entry);
  if (entry.powerMax !== undefined) return formatMetric("powerMax", entry.powerMax, entry);
  if (entry.durationMaxSec !== undefined) return formatMetric("durationMax", entry.durationMaxSec);
  if (entry.repsMax !== undefined) return formatMetric("reps", entry.repsMax);
  return undefined;
}

export async function loadGoalDetail(key: GoalKey, today: string): Promise<GoalDetail | undefined> {
  const goal = await getGoalByKey(key);
  if (!goal) return undefined;

  const [results, weights, protocols, exercises, workouts, sessions, cycle, schedule] = await Promise.all([
    getAllTestResults(),
    getWeightEntries(),
    getAllTestProtocols(),
    getAllExercises(),
    db.workouts.where("status").equals("completed").toArray(),
    db.plannedSessions.toArray(),
    getSetting("testCycle"),
    getSetting("testSchedule"),
  ]);

  const progress = goalProgressFrom(goal, results, weights, today);
  const protocolId = goalProtocolId(goal, progress.segment);
  const protocol = protocols.find((item) => item.id === protocolId);
  const version = protocol ? await getTestProtocolVersion(protocol.activeVersionId) : undefined;
  const versions = new Map<string, TestProtocolVersion | undefined>();
  for (const item of protocols) versions.set(item.id, item.id === protocol?.id ? version : await getTestProtocolVersion(item.activeVersionId));

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const weight = progress.segment.measure?.source === "weight_weekly_average";
  const measureKey = progress.segment.measure?.source === "test" ? progress.segment.measure.measureKey : undefined;
  const unit = version?.measures.find((measure) => measure.key === measureKey)?.unit ?? "";
  const formatValue = (value: number) => (weight ? `${formatTestNumber(value)} kg` : unit ? `${formatTestNumber(value)} ${unit}` : formatTestNumber(value));

  const nextTest =
    protocol && protocol.status === "active" && cycle
      ? nextTestDate({ protocolId: protocol.id, protocolKey: protocol.key, sessions, schedule: schedule ?? [], cycle, results, today })
      : undefined;

  const secondary = goal.secondaryIndicators.map((indicator) =>
    indicator.kind === "exercise"
      ? exerciseCard(indicator, exerciseById.get(indicator.exerciseId), workouts)
      : measureCard(indicator, versions.get(indicator.protocolId), results),
  );

  return {
    goal,
    progress,
    ...(protocol ? { protocol } : {}),
    ...(version ? { version } : {}),
    formatValue,
    ...(nextTest ? { nextTest } : {}),
    secondary,
    linkedSessions: linkedSessionsOf(goal, workouts, exerciseById),
  };
}
