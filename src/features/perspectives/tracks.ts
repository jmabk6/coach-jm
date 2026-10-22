import type {
  Exercise,
  ExerciseBlock,
  Id,
  LoadSteps,
  PerspectiveSession,
  ProgressionEngine,
  ProgressionTrack,
  SessionTemplate,
  StrengthFrameVersion,
  TrajectoryWeek,
  WorkoutSession,
} from "../../domain";
import { PERSPECTIVE_HORIZON } from "../../domain";
import {
  DURATION_STEP_SEC,
  estimatePace,
  forecastWeeks,
  mondayOf,
  PROVISIONAL_BELOW,
  trackResults,
  weeklyLevels,
  type DurationPrescription,
  type LoadPrescription,
} from "../../domain/rules/progressionRules";
import { V6_REFERENCE } from "../goals/tractionV6";

/**
 * Pistes des perspectives (lot P1, 22/10/2026) : une par exercice de
 * force des séances Muscu A, B et C du programme V2 actif. Les blocs cardio
 * (tapis) et les groupes n'en ont pas : ils gardent leur fonctionnement.
 */

export const PERSPECTIVE_TEMPLATES: Readonly<Record<PerspectiveSession, Id>> = { A: "v2-muscu-a", B: "v2-muscu-b", C: "v2-muscu-c" };

/**
 * Référence par défaut : tout l'historique du programme V2 (04/10/2026).
 * Les séances d'avant portent d'autres briques de modèle : elles ne sont de
 * toute façon pas rattachées aux pistes.
 */
export const DEFAULT_REFERENCE = { from: "2026-10-04", reason: "Programme V2 (depuis le 04/10/2026)." } as const;

/** Plafond de RPE par défaut quand ni la consigne ni le cadre n'en donnent (isolation, volume). */
export const DEFAULT_RPE_MAX = 8;

/**
 * Références explicites : la suspension se fait sans assistance depuis le
 * 15/10/2026 ; les séances assistées d'avant (assistance notée seulement en
 * commentaire) ne sont pas comparées.
 */
export const REFERENCE_OVERRIDES: Readonly<Record<Id, { from: string; reason: string }>> = {
  "suspension-omoplates": { from: "2026-10-15", reason: "Sans assistance depuis le 15/10/2026 ; les séances assistées d'avant ne sont pas comparées." },
};

export interface TrackSpec {
  id: Id;
  session: PerspectiveSession;
  templateId: Id;
  exerciseId: Id;
  engine: ProgressionEngine;
  load?: LoadPrescription;
  duration?: DurationPrescription;
  /** Négatives : nombre de séries. */
  negativeSets?: number;
  shareGroup?: string;
  reference: { from: string; reason: string };
}

const rangeOf = (value: number | { min: number; max: number }) => (typeof value === "number" ? { min: value, max: value } : value);

function engineOf(exercise: Exercise): ProgressionEngine | undefined {
  if (exercise.category !== "Musculation") return undefined;
  if (exercise.id === "traction-assistee") return "v6";
  if (exercise.measurementType === "load_reps") return "load";
  if (exercise.measurementType === "duration") return "duration";
  if (exercise.measurementType === "reps_duration") return "negatives";
  return undefined;
}

/**
 * Les pistes des trois séances : consigne de la brique, plafond de RPE en
 * vigueur (consigne de la séance, sinon cadre si la brique est dans le
 * cadre, sinon 8). Un même exercice à consigne identique, dans le cadre,
 * dans plusieurs séances forme un groupe partagé (élévations latérales).
 */
export function trackSpecsFrom(
  templates: ReadonlyArray<SessionTemplate>,
  exercises: ReadonlyMap<Id, Exercise>,
  activeVersions: ReadonlyMap<Id, StrengthFrameVersion>,
): TrackSpec[] {
  const specs: TrackSpec[] = [];
  for (const session of ["A", "B", "C"] as const) {
    const template = templates.find((item) => item.id === PERSPECTIVE_TEMPLATES[session]);
    if (!template) continue;
    const blocks = template.blocks.filter((block): block is ExerciseBlock => block.kind === "exercise").sort((a, b) => a.position - b.position);
    for (const block of blocks) {
      const exercise = exercises.get(block.exerciseId);
      const engine = exercise ? engineOf(exercise) : undefined;
      if (!exercise || !engine) continue;
      const instructions = block.instructions;
      const version = block.outsideFrame ? undefined : activeVersions.get(block.exerciseId);
      const rpeMax = ("targetRpe" in instructions ? instructions.targetRpe?.max : undefined) ?? version?.rpeTarget ?? DEFAULT_RPE_MAX;
      const reference = REFERENCE_OVERRIDES[block.exerciseId] ?? { ...DEFAULT_REFERENCE };
      const spec: TrackSpec = { id: block.id, session, templateId: template.id, exerciseId: block.exerciseId, engine, reference };
      if (instructions.shape === "reps" && (engine === "load" || engine === "v6")) {
        spec.load = { sets: instructions.sets, repMin: instructions.reps.min, repMax: instructions.reps.max, rpeMax };
      } else if (instructions.shape === "duration" && engine === "duration") {
        const range = rangeOf(instructions.durationSec);
        spec.duration = { sets: instructions.sets, durationMin: range.min, durationMax: range.max, rpeMax };
      } else if (instructions.shape === "reps" && engine === "negatives") {
        spec.negativeSets = instructions.sets;
      } else {
        continue;
      }
      specs.push(spec);
    }
  }

  /* Groupe partagé : même exercice, même consigne et plafond, dans le cadre, dans au moins deux séances. */
  const signature = (spec: TrackSpec) => (spec.engine === "load" && spec.load ? `${spec.exerciseId}|${spec.load.sets}|${spec.load.repMin}|${spec.load.repMax}|${spec.load.rpeMax}` : undefined);
  const inFrame = (spec: TrackSpec) =>
    templates.some((template) => template.blocks.some((block) => block.id === spec.id && block.kind === "exercise" && !block.outsideFrame)) && activeVersions.has(spec.exerciseId);
  const counts = new Map<string, number>();
  for (const spec of specs) {
    const key = signature(spec);
    if (key && inFrame(spec)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const spec of specs) {
    const key = signature(spec);
    if (key && inFrame(spec) && (counts.get(key) ?? 0) >= 2) spec.shareGroup = `shared:${spec.exerciseId}`;
  }
  return specs;
}

/** Les briques dont l'historique nourrit une piste : la sienne, ou tout son groupe partagé. */
export function sourceIdsOf(spec: Pick<TrackSpec, "id" | "shareGroup">, all: ReadonlyArray<Pick<TrackSpec, "id" | "shareGroup">>): Id[] {
  return spec.shareGroup ? all.filter((item) => item.shareGroup === spec.shareGroup).map((item) => item.id) : [spec.id];
}

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Trajectoire initiale de la traction : la référence V6 figée, sans second moteur. */
function v6InitialWeeks(session: PerspectiveSession, fromWeek: string): TrajectoryWeek[] {
  return V6_REFERENCE.flatMap((week): TrajectoryWeek[] => {
    const day = session === "A" ? week.date : addDays(week.date, 2);
    const monday = mondayOf(day);
    if (monday < fromWeek || day > PERSPECTIVE_HORIZON) return [];
    if (session === "A") {
      return [{ week: monday, probable: { kg: week.refKg, ...(week.refReps ? { reps: Math.min(...week.refReps) } : {}) } }];
    }
    const kg = Number(/^(\d+)/.exec(week.b)?.[1]);
    return Number.isFinite(kg) ? [{ week: monday, probable: { kg, reps: 8 } }] : [];
  });
}

/**
 * La trajectoire initiale d'une piste, calculée une fois au départ sur
 * l'historique comparable (hypothèses de calcul du 22/10/2026).
 */
export function initialTrajectory(
  spec: TrackSpec,
  all: ReadonlyArray<TrackSpec>,
  workouts: ReadonlyArray<WorkoutSession>,
  steps: LoadSteps | undefined,
  now: string,
  today: string,
): ProgressionTrack["initial"] {
  const fromWeek = mondayOf(today);
  if (spec.engine === "v6") return { createdAt: now, weeks: v6InitialWeeks(spec.session, fromWeek), provisional: false };

  const results = trackResults(workouts, sourceIdsOf(spec, all), spec.reference.from);
  const points = weeklyLevels(results);
  const provisional = points.length < PROVISIONAL_BELOW;
  const last = results.at(-1);
  if (!last) return { createdAt: now, weeks: [], provisional: true };

  if (spec.engine === "load" && spec.load && steps) {
    const level = points.at(-1)!.level;
    const currentKg = Math.max(...last.sets.map((set) => set.kg));
    return { createdAt: now, weeks: forecastWeeks({ level, pace: estimatePace(points), fromWeek, until: PERSPECTIVE_HORIZON, prescription: spec.load, steps, currentKg }), provisional };
  }

  if (spec.engine === "duration" && spec.duration) {
    /* Durée : +2 s par semaine au plus, bornée au haut de la consigne. */
    const start = Math.min(...last.sets.map((set) => set.durationSec ?? 0));
    const weeks: TrajectoryWeek[] = [];
    for (let index = 0, week = fromWeek; week <= PERSPECTIVE_HORIZON; index += 1, week = addDays(week, 7)) {
      weeks.push({ week, probable: { durationSec: Math.min(spec.duration.durationMax, start + index * DURATION_STEP_SEC) } });
    }
    return { createdAt: now, weeks, provisional };
  }

  return { createdAt: now, weeks: [], provisional: true };
}

export function buildTrack(
  spec: TrackSpec,
  all: ReadonlyArray<TrackSpec>,
  workouts: ReadonlyArray<WorkoutSession>,
  steps: LoadSteps | undefined,
  now: string,
  today: string,
): ProgressionTrack {
  return {
    id: spec.id,
    session: spec.session,
    templateId: spec.templateId,
    exerciseId: spec.exerciseId,
    engine: spec.engine,
    ...(spec.shareGroup ? { shareGroup: spec.shareGroup } : {}),
    createdAt: now,
    initial: initialTrajectory(spec, all, workouts, steps, now, today),
    references: [spec.reference],
  };
}
