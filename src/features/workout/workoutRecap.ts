import { formatDurationShort } from "../../domain/rules/blockInstructionRules";
import type {
  CardioStepSettings,
  Exercise,
  Id,
  Load,
  PerformedBlock,
  PerformedCardioStep,
  PerformedSeries,
  PerformedSimpleMeasurement,
  SessionTemplate,
  StrengthFrameVersion,
  WorkoutPause,
  WorkoutSession,
} from "../../domain";
import {
  SERIES_SIDE_LIMITED_LABEL,
  SERIES_WARMUP_SHORT_LABEL,
  formatFrameValidation,
  isWorkSeries,
  summarizeSeriesRoles,
  type FrameValidationResult,
  type SeriesRoleSummary,
} from "../../domain/rules/strengthRules";
import { calculateVolume, getLoadKg } from "../../domain/rules/workoutRules";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { estimateSessionTemplateDurationSec } from "../../domain/rules/sessionTemplateRules";
import { formatBlockCompletion, summarizeBlockCompletion } from "./engine/workoutBlocks";
import { findSubstitutionRound } from "./engine/workoutEngine";
import { summarizeRests, type RestSummary } from "./engine/workoutTime";

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

/**
 * Une durée de repos lisible : `45 s`, `2 min`, `5 min 45 s`. Format
 * d'affichage seulement — les valeurs stockées restent en secondes.
 */
export function formatSeconds(sec: number): string {
  const whole = Math.round(sec);

  if (whole < 60) return `${whole} s`;

  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;

  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
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
 * comprise (§14), jamais reléguée ailleurs. Un échauffement et une série
 * limitée par un côté se signalent (`éch.`, `limitée par un côté`) ; une
 * série de travail ordinaire ne porte rien de plus (v1.6, § 4.4).
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

  if (!isWorkSeries(series)) extras.push(SERIES_WARMUP_SHORT_LABEL);
  else if (series.sideLimited === true) extras.push(SERIES_SIDE_LIMITED_LABEL);
  if (series.rpe !== undefined) extras.push(`RPE ${series.rpe}`);
  if (series.note) extras.push(series.note);

  return [line || "—", ...extras].join(" · ");
}

/**
 * Les trois colonnes d'un réglage de palier : `1 min 30`, `5 km/h`, `12 %`
 * (ou `1,2 km` et rien pour un palier en distance).
 */
export function formatCardioSettings(settings: CardioStepSettings): {
  duration: string;
  first: string;
  second: string;
} {
  if ("speedKmh" in settings) {
    return {
      duration: formatDurationShort(settings.durationSec),
      first: `${fr.format(settings.speedKmh)} km/h`,
      second: `${fr.format(settings.inclinePercent)} %`,
    };
  }

  return {
    duration: formatDurationShort(settings.durationSec),
    first: `${fr.format(settings.distanceKm)} km`,
    second: "",
  };
}

/**
 * `5 min · 5 km/h · 12 %` sur une ligne.
 */
export function formatCardioSettingsLine(settings: CardioStepSettings): string {
  const parts = formatCardioSettings(settings);

  return [parts.duration, parts.first, parts.second].filter(Boolean).join(" · ");
}

/**
 * `7 km`, `45 min · 7 km · 118 bpm`, `−3 cm`, `G 12 cm · D 9 cm` : une
 * mesure simple sur une ligne, avec sa note.
 */
export function formatSimpleMeasurement(
  measure: PerformedSimpleMeasurement,
  exercise?: Exercise | undefined,
): string {
  const parts: string[] = [];

  if (measure.durationSec !== undefined) parts.push(formatDurationShort(measure.durationSec));
  if (measure.distanceKm !== undefined) parts.push(`${fr.format(measure.distanceKm)} km`);
  if (measure.distanceCm !== undefined) {
    const label = exercise?.measurementLabels?.value;
    parts.push(`${label ? `${label} ` : ""}${fr.format(measure.distanceCm)} cm`);
  }
  if (measure.sideValues && measure.sideValues.length > 0) {
    parts.push(
      measure.sideValues
        .map((value) => {
          const side = value.side === "left" ? "G" : "D";
          return `${side} ${fr.format(value.distanceCm ?? value.reps ?? value.durationSec ?? 0)} cm`;
        })
        .join(" · "),
    );
  }
  if (measure.bpm !== undefined) parts.push(`${measure.bpm} bpm`);
  if (measure.note) parts.push(measure.note);

  return parts.join(" · ") || "Mesure simple";
}

export function formatStepSettings(step: PerformedCardioStep): {
  duration: string;
  first: string;
  second: string;
} {
  return formatCardioSettings(step.settings);
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
  /**
   * Durée estimée depuis les consignes du modèle (Q2), jamais une
   * moyenne d'historique ; absente pour une séance libre sans modèle.
   */
  plannedDurationSec?: number;
  startedAt: string;
  completedAt?: string;
  volumeKg: number;
  seriesDone: number;
  /**
   * Séries et tours attendus : toutes les entrées des briques non
   * sautées — le dénominateur de `28 / 30`.
   */
  seriesPlanned: number;
  /**
   * Rôles des séries réalisées (v1.6, décisions 6 et 10) : `counted` =
   * travail non limitées, ce qui entrera dans la validation d'un palier ;
   * échauffements et séries limitées restent dans `seriesDone` et dans le
   * volume. Les enfants de tour comptent comme des séries de travail.
   */
  roles: SeriesRoleSummary;
  rpe?: CoveredAverage;
  bpm?: { min: number; max: number; average: CoveredAverage };
  cardioSteps: number;
  cardioStepsPlanned: number;
  cardioDurationSec: number;
  /**
   * Paliers avec un BPM relevé, sur les paliers validés.
   */
  bpmKnown: number;
  /**
   * Repos moyen des seuls repos comparables, avec sa couverture et le
   * prévu ; les repos intra-tour n'en font jamais partie (§12).
   */
  rest: RestSummary;
  pauses: WorkoutPause[];
  performed: number;
  skipped: number;
  notPerformed: number;
  added: number;
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

/**
 * Les enfants de tour validés, vus comme des séries : même volume, même
 * RPE, pour que groupes et exercices comptent pareil dans le récap.
 */
export function listCompletedRoundChildren(blocks: PerformedBlock[]): PerformedSeries[] {
  const series: PerformedSeries[] = [];

  for (const block of blocks) {
    if (block.kind !== "group" || block.status === "skipped") continue;

    for (const round of block.rounds) {
      for (const child of round.children) {
        if (child.completedAt === undefined) continue;
        series.push({
          id: child.id,
          position: round.roundNumber,
          status: "completed",
          ...(child.load !== undefined ? { load: child.load } : {}),
          ...(child.reps !== undefined ? { reps: child.reps } : {}),
          ...(child.durationSec !== undefined ? { durationSec: child.durationSec } : {}),
          ...(child.rpe !== undefined ? { rpe: child.rpe } : {}),
        });
      }
    }
  }

  return series;
}

/**
 * Volume (tonnage) de briques qui mêlent plusieurs exercices, sur le
 * périmètre de `listCompletedSeries` + `listCompletedRoundChildren` :
 * chaque série compte selon le sens de charge de l'exercice réellement
 * effectué (brique, ou enfant de tour pour un groupe) — une assistance
 * vaut 0 (lot a). Exercice absent de `exerciseById` = `external`.
 */
export function calculateBlocksVolume(
  blocks: PerformedBlock[],
  exerciseById?: ReadonlyMap<Id, Exercise>,
): number {
  let total = 0;

  for (const block of blocks) {
    if (block.kind === "exercise") {
      total += calculateVolume(
        listCompletedSeries([block]),
        loadSemanticsOf(exerciseById?.get(block.exerciseId)),
      );
      continue;
    }

    if (block.kind !== "group") continue;

    for (const round of block.rounds) {
      for (const child of round.children) {
        total += calculateVolume(
          listCompletedRoundChildren([{ ...block, rounds: [{ ...round, children: [child] }] }]),
          loadSemanticsOf(exerciseById?.get(child.exerciseId)),
        );
      }
    }
  }

  return total;
}

/**
 * Séries attendues d'une réalisation : séries des exercices et tours ×
 * enfants des groupes, briques sautées exclues (elles sortent du
 * dénominateur, §11).
 */
export function countPlannedSeries(blocks: PerformedBlock[]): number {
  let total = 0;

  for (const block of blocks) {
    if (block.kind === "note" || block.status === "skipped") continue;

    if (block.kind === "exercise") {
      total += block.series?.length ?? 0;
      continue;
    }

    total += block.rounds.length * block.children.length;
  }

  return total;
}

export function summarizeWorkout(
  workout: WorkoutSession,
  template?: SessionTemplate,
  exerciseById?: ReadonlyMap<Id, Exercise>,
): WorkoutRecapHead {
  const series = [...listCompletedSeries(workout.blocks), ...listCompletedRoundChildren(workout.blocks)];
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
  let added = 0;

  for (const block of workout.blocks) {
    if (block.kind === "note") continue;
    if (block.status === "performed") performed += 1;
    else if (block.status === "skipped") skipped += 1;
    else notPerformed += 1;
    if (block.addedDuringWorkout) added += 1;
  }

  const plannedSteps = workout.blocks.reduce(
    (sum, block) =>
      block.kind === "exercise" && block.status !== "skipped"
        ? sum + (block.cardioSteps?.length ?? 0)
        : sum,
    0,
  );

  return {
    activeDurationSec: workout.activeDurationSec,
    ...(template && workout.sessionTemplateId
      ? { plannedDurationSec: estimateSessionTemplateDurationSec(template.blocks) }
      : {}),
    startedAt: workout.startedAt,
    ...(workout.completedAt ? { completedAt: workout.completedAt } : {}),
    volumeKg: calculateBlocksVolume(workout.blocks, exerciseById),
    seriesDone: series.length,
    seriesPlanned: countPlannedSeries(workout.blocks),
    roles: summarizeSeriesRoles(series),
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
    cardioStepsPlanned: plannedSteps,
    cardioDurationSec: steps.reduce(
      (sum, step) => sum + step.settings.durationSec,
      0,
    ),
    bpmKnown: knownBpm.length,
    rest: summarizeRests(workout.blocks),
    pauses: (workout.pauses ?? []).filter((pause) => pause.endedAt !== undefined),
    performed,
    skipped,
    notPerformed,
    added,
  };
}

/* -------------------------------------------------------------------------- */
/* Volume : comparaison à la dernière fois                                    */
/* -------------------------------------------------------------------------- */

/**
 * Une séance n'est comparable en volume que si son périmètre est celui
 * du modèle (décision Q1 du 17/09/2026) : aucun exercice ajouté, sauté ou
 * non réalisé, aucune substitution — brique autonome ou enfant de groupe.
 */
export function isVolumePerimeterIntact(workout: WorkoutSession): boolean {
  for (const block of workout.blocks) {
    if (block.kind === "note") continue;
    if (block.addedDuringWorkout || block.status !== "performed") return false;

    if (block.kind === "exercise" && block.originalExerciseId !== undefined) return false;

    if (
      block.kind === "group" &&
      block.children.some((child) => findSubstitutionRound(block, child.id) !== undefined)
    ) {
      return false;
    }
  }

  return true;
}

export interface VolumeComparison {
  previousWorkoutId: string;
  previousDate: string;
  previousVolumeKg: number;
  deltaPercent: number;
}

/**
 * `+12 % vs dernière fois` : contre la dernière réalisation terminée du
 * même modèle, antérieure, seulement si les deux périmètres sont
 * intacts. Sinon rien : un pourcentage trompeur ne s'affiche pas.
 */
export function compareVolumeToPrevious(
  workout: WorkoutSession,
  completedWorkouts: WorkoutSession[],
  exerciseById?: ReadonlyMap<Id, Exercise>,
): VolumeComparison | undefined {
  if (!workout.sessionTemplateId || !isVolumePerimeterIntact(workout)) return undefined;

  const previous = completedWorkouts
    .filter(
      (candidate) =>
        candidate.id !== workout.id &&
        candidate.status === "completed" &&
        candidate.sessionTemplateId === workout.sessionTemplateId &&
        candidate.startedAt < workout.startedAt,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  if (!previous || !isVolumePerimeterIntact(previous)) return undefined;

  const previousVolumeKg = calculateBlocksVolume(previous.blocks, exerciseById);
  const volumeKg = calculateBlocksVolume(workout.blocks, exerciseById);

  if (previousVolumeKg <= 0) return undefined;

  return {
    previousWorkoutId: previous.id,
    previousDate: previous.date,
    previousVolumeKg,
    deltaPercent: Math.round(((volumeKg - previousVolumeKg) / previousVolumeKg) * 100),
  };
}

/**
 * `Pause 10:42 – 11:15 · 33 min, non comptée dans la durée active`.
 */
export function formatPause(pause: WorkoutPause): string {
  const end = pause.endedAt ?? pause.startedAt;
  const seconds = Math.round(
    (new Date(end).getTime() - new Date(pause.startedAt).getTime()) / 1000,
  );
  const duration = seconds < 60 ? `${seconds} s` : formatMinutes(seconds);

  return `Pause ${formatClock(pause.startedAt)} – ${formatClock(end)} · ${duration}, non comptée dans la durée active`;
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
  /**
   * Sort du palier pour une brique ou un groupe cadré (v1.6, § 4.4) :
   * « Validé — 100 kg » ou « Non validé — motif ». Absent hors cadre.
   */
  frameLine?: string;
}

/** « Validé — 100 kg » / « Palier validé à 40 kg — 45 kg reste à confirmer sur 3 séries » / « Non validé — motif ». */
export function formatFrameOutcome(result: FrameValidationResult, workSets: number): string {
  return formatFrameValidation(result, workSets);
}

/**
 * Pose la ligne de cadre sur chaque ligne du récap : la brique lit sa
 * version, un groupe liste celles de ses tours (avec le nom de l'exercice
 * s'il y en a plusieurs). Recalculé depuis les séries, même résultat
 * qu'à la clôture.
 */
export function withFrameLines(
  lines: WorkoutRecapLine[],
  outcomes: ReadonlyMap<Id, FrameValidationResult>,
  exerciseById: Map<Id, Exercise>,
  versionById: ReadonlyMap<Id, StrengthFrameVersion>,
): WorkoutRecapLine[] {
  if (outcomes.size === 0) return lines;

  const text = (versionId: Id, result: FrameValidationResult) =>
    formatFrameOutcome(result, versionById.get(versionId)?.workSets ?? 0);

  return lines.map((line) => {
    const { block } = line;

    if (block.kind === "exercise") {
      const result = block.frameVersionId !== undefined ? outcomes.get(block.frameVersionId) : undefined;
      return result ? { ...line, frameLine: text(block.frameVersionId!, result) } : line;
    }

    if (block.kind === "group") {
      const seen = new Map<Id, Id>();
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (child.frameVersionId !== undefined && !seen.has(child.frameVersionId)) {
            seen.set(child.frameVersionId, child.exerciseId);
          }
        }
      }
      const parts = [...seen]
        .filter(([versionId]) => outcomes.has(versionId))
        .map(([versionId, exerciseId]) => {
          const outcome = text(versionId, outcomes.get(versionId)!);
          return seen.size > 1 ? `${exerciseById.get(exerciseId)?.name ?? exerciseId} : ${outcome}` : outcome;
        });
      return parts.length > 0 ? { ...line, frameLine: parts.join(" · ") } : line;
    }

    return line;
  });
}

/**
 * Le tableau du récapitulatif (§14) : les briques prévues numérotées
 * dans l'ordre, puis les ajouts pendant la séance dans une section à
 * part, numérotés à la suite.
 */
export function splitRecapLines(
  lines: WorkoutRecapLine[],
  /**
   * Faux pour une séance libre sans modèle : tout y est ajouté au fil de
   * l'eau, une section « Ajouts » n'aurait rien à distinguer.
   */
  separateAdded = true,
): {
  planned: WorkoutRecapLine[];
  added: WorkoutRecapLine[];
} {
  const planned: WorkoutRecapLine[] = [];
  const added: WorkoutRecapLine[] = [];
  let visibleNumber = 0;

  for (const line of lines) {
    if (line.block.kind === "note" || !separateAdded || !line.block.addedDuringWorkout) {
      const numbered =
        line.block.kind === "note" ? line : { ...line, number: String(++visibleNumber) };
      planned.push(numbered);
    }
  }

  for (const line of lines) {
    if (separateAdded && line.block.kind !== "note" && line.block.addedDuringWorkout) {
      added.push({ ...line, number: String(++visibleNumber) });
    }
  }

  return { planned, added };
}

export const recapStatusLabels = {
  performed: "Réalisé",
  skipped: "Sauté",
  not_performed: "Non réalisé",
} as const;

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
      const roundSeries = listCompletedRoundChildren([block]);
      const groupRpes = roundSeries.map((item) => item.rpe).filter((v): v is number => v !== undefined);
      const groupVolume = calculateBlocksVolume([block], exerciseById);
      const substituted = block.children.filter(
        (child) => findSubstitutionRound(block, child.id) !== undefined,
      ).length;

      return {
        block,
        number,
        name: block.name ?? `Groupe ${number}`,
        subtitle:
          block.status === "skipped"
            ? "Sauté"
            : block.status === "not_performed"
              ? "Non réalisé"
              : `${rounds.length} tour${rounds.length > 1 ? "s" : ""} sur ${block.rounds.length} · ${block.children.length} exercices${
                  substituted > 0 ? ` · ${substituted} remplacé${substituted > 1 ? "s" : ""}` : ""
                }`,
        ...(groupVolume > 0 ? { volumeKg: groupVolume } : {}),
        ...(groupRpes.length > 0
          ? { rpe: groupRpes.reduce((sum, value) => sum + value, 0) / groupRpes.length }
          : {}),
      };
    }

    const exercise = exerciseById.get(block.exerciseId);
    const original = block.originalExerciseId
      ? exerciseById.get(block.originalExerciseId)
      : undefined;
    /* Substitution (§13) : la progression va à l'exercice réellement fait,
       le prévu reste lisible. */
    const name = `${exercise?.name ?? "Exercice supprimé"}${
      original && original.id !== block.exerciseId ? ` (prévu : ${original.name})` : ""
    }`;
    const series = (block.series ?? []).filter((item) => item.status === "completed");
    const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");
    const rpes = series.map((item) => item.rpe).filter((v): v is number => v !== undefined);

    if (block.cardioSteps && (steps.length > 0 || block.status === "performed")) {
      const durationSec = steps.reduce((sum, step) => sum + step.settings.durationSec, 0);
      const missing = block.cardioSteps.length - steps.length;

      return {
        block,
        number,
        name,
        subtitle:
          missing > 0
            ? `${formatBlockCompletion(summarizeBlockCompletion(block))} · ${formatMinutes(durationSec)}`
            : `${steps.length} palier${steps.length > 1 ? "s" : ""} · ${formatMinutes(durationSec)}`,
        ...(exercise ? { category: exercise.category } : {}),
      };
    }

    if (block.simpleMeasurement) {
      return {
        block,
        number,
        name,
        subtitle: formatSimpleMeasurement(block.simpleMeasurement, exercise),
        ...(exercise ? { category: exercise.category } : {}),
      };
    }

    const volume = calculateVolume(series, loadSemanticsOf(exercise));
    const hasLoad = series.some((item) => item.load && getLoadKg(item.load) !== undefined);

    return {
      block,
      number,
      name,
      subtitle:
        block.status === "performed"
          ? block.series && series.length < block.series.length
            ? formatBlockCompletion(summarizeBlockCompletion(block))
            : `${series.length} série${series.length > 1 ? "s" : ""}`
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
