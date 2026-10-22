import type { DayTarget, Exercise, Id, ProgressionTrack, SetTarget, TrajectoryWeek, WorkoutSession } from "../../domain";
import { PERSPECTIVE_HORIZON } from "../../domain";
import {
  estimatePace,
  forecastWeeks,
  mondayOf,
  sessionLevel,
  trackResults,
  weeklyLevels,
  weekStatus,
  type SessionResult,
  type WeekStatus,
} from "../../domain/rules/progressionRules";
import { v6State } from "../goals/tractionV6";
import { dayTargetForTrack, type DayTargetContext } from "./dayTargets";
import { sourceIdsOf, type TrackSpec } from "./tracks";

/**
 * Perspectives au 31 mars (lot P3, 22/10/2026) : la vue d'une piste.
 * Quatre repères, jamais confondus :
 * - **initial** : la trajectoire enregistrée au départ (jamais réécrite) ;
 * - **présenté** : l'objectif du jour figé sur la séance de cette semaine ;
 * - **réel** : ce qui a été noté ;
 * - **actualisé** : pour les semaines à venir, l'objectif de la prochaine
 *   séance puis la prévision recalculée aujourd'hui (jamais stockée).
 * Une semaine à venir n'a jamais de statut réussi ou raté.
 */

export type PerspectiveStatus = "ahead" | "on_track" | "consolidate" | "insufficient" | "suspended";

export interface WeekRow {
  /** Lundi de la semaine. */
  week: string;
  initial?: SetTarget | undefined;
  presented?: DayTarget | undefined;
  /** Semaines à venir : objectif de la prochaine séance (semaine courante), puis prévision. */
  actualized?: { next?: DayTarget | undefined; forecast?: SetTarget | undefined } | undefined;
  actual?: SessionResult | undefined;
  status: WeekStatus;
}

export interface PerspectiveForecast {
  probable?: SetTarget | undefined;
  low?: SetTarget | undefined;
  high?: SetTarget | undefined;
  /** Provisoire tant que moins de `PROVISIONAL_BELOW` semaines comptent une séance comparable. */
  provisional: boolean;
  /** Semaines distinctes avec au moins une séance comparable (deux séances la même semaine comptent pour une). */
  weeksWithSession: number;
  /** Rythme retenu et brut, pour l'explication des hypothèses. */
  paceWeekly: number;
  paceRaw?: number | undefined;
}

export interface PerspectiveView {
  track: ProgressionTrack;
  exercise: Exercise | undefined;
  results: SessionResult[];
  last?: SessionResult | undefined;
  /** Objectif de la prochaine séance (règles), sauf traction (pari V6). */
  next?: DayTarget | undefined;
  /** Traction : le palier en cours du pari V6. */
  v6?: { kg: number; text: string } | undefined;
  /** Prévision actualisée au 31 mars ; absente : à affiner, suspendue ou traction. */
  forecast?: PerspectiveForecast | undefined;
  status: PerspectiveStatus;
  weeks: WeekRow[];
}

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

function presentedTargets(workouts: ReadonlyArray<WorkoutSession>, sourceIds: ReadonlyArray<Id>): Map<string, DayTarget> {
  const wanted = new Set(sourceIds);
  const byWeek = new Map<string, DayTarget>();
  for (const workout of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const block of workout.blocks) {
      if (block.kind === "exercise" && block.sourceBlockId && wanted.has(block.sourceBlockId) && block.dayTarget) byWeek.set(mondayOf(workout.date), block.dayTarget);
    }
  }
  return byWeek;
}

/** Traction : statut d'une semaine par l'aide utilisée face à la référence du pari (moins d'aide = en avance). */
function v6WeekStatus(initial: SetTarget | undefined, actual: SessionResult | undefined, week: string, today: string): WeekStatus {
  if (week > mondayOf(today)) return "upcoming";
  if (!actual) return week === mondayOf(today) ? "upcoming" : "missed";
  if (initial?.kg === undefined) return "insufficient";
  const used = Math.max(...actual.sets.map((set) => set.kg));
  return used < initial.kg ? "ahead" : used === initial.kg ? "on_track" : "consolidate";
}

export function buildPerspectiveView(
  track: ProgressionTrack,
  spec: TrackSpec | undefined,
  context: DayTargetContext,
  /** Séances enregistrées et séance en cours (pour l'objectif présenté). */
  allWorkouts: ReadonlyArray<WorkoutSession>,
  today: string,
  now: string,
): PerspectiveView {
  const exercise = context.exerciseById.get(track.exerciseId);
  const sourceIds = spec ? sourceIdsOf(spec, context.specs) : [track.id];
  const results = trackResults(context.completed, sourceIds, track.references.at(-1)?.from);
  const last = results.at(-1);
  const presented = presentedTargets(allWorkouts, sourceIds);
  const resultsByWeek = new Map<string, SessionResult>();
  for (const result of results) resultsByWeek.set(mondayOf(result.date), result);

  const thisWeek = mondayOf(today);
  const fromWeek = track.initial.weeks[0]?.week ?? mondayOf(track.createdAt.slice(0, 10));
  const initialByWeek = new Map(track.initial.weeks.map((week) => [week.week, week]));

  /* Traction : le pari V6 décide ; ni objectif ni prévision du moteur des charges. */
  if (track.engine === "v6") {
    const state = v6State(context.completed, today);
    const v6 =
      track.session === "A"
        ? { kg: state.aKg, text: `${state.aKg} kg d’aide · 3 séries jusqu’à 5 · RPE ≤ 9` }
        : { kg: state.bKg, text: `${state.bKg} kg d’aide · 3 × 8–10 · RPE 6–8` };
    const weeks: WeekRow[] = [];
    for (let week = fromWeek; week <= PERSPECTIVE_HORIZON; week = addDays(week, 7)) {
      const initial = initialByWeek.get(week)?.probable;
      const actual = resultsByWeek.get(week);
      weeks.push({ week, initial, actual, status: v6WeekStatus(initial, actual, week, today) });
    }
    const latest = [...weeks].reverse().find((row) => row.actual);
    const status: PerspectiveStatus = !last ? "insufficient" : latest?.status === "ahead" ? "ahead" : latest?.status === "consolidate" ? "consolidate" : "on_track";
    return { track, exercise, results, last, v6, status, weeks };
  }

  const next = dayTargetForTrack(track.id, today, context, now);
  const points = weeklyLevels(results);
  const pace = estimatePace(points);
  const steps = exercise?.loadSteps;

  let forecast: PerspectiveForecast | undefined;
  let forecastByWeek = new Map<string, TrajectoryWeek>();
  if (!track.suspension && last && track.engine === "load" && spec?.load && steps) {
    const weeks = forecastWeeks({ level: points.at(-1)!.level, pace, fromWeek: thisWeek, until: PERSPECTIVE_HORIZON, prescription: spec.load, steps, currentKg: Math.max(...last.sets.map((set) => set.kg)) });
    forecastByWeek = new Map(weeks.map((week) => [week.week, week]));
    const end = weeks.at(-1);
    forecast = { probable: end?.probable, low: end?.low, high: end?.high, provisional: pace.provisional, weeksWithSession: pace.points, paceWeekly: pace.weekly, paceRaw: pace.raw };
  }

  const weeks: WeekRow[] = [];
  for (let week = fromWeek; week <= PERSPECTIVE_HORIZON; week = addDays(week, 7)) {
    const initial = initialByWeek.get(week);
    const actual = resultsByWeek.get(week);
    const future = week > thisWeek || (week === thisWeek && !actual);
    weeks.push({
      week,
      initial: initial?.probable,
      presented: presented.get(week),
      actualized: future ? { forecast: forecastByWeek.get(week)?.probable } : undefined,
      actual,
      status: weekStatus({ week, today, initialLevel: initial?.level, actualLevel: actual ? sessionLevel(actual) : undefined, suspended: track.suspension !== undefined && week >= mondayOf(track.suspension.from) }),
    });
  }
  /* La prochaine séance : la semaine courante si elle n'a pas encore de résultat, sinon la suivante. */
  const nextRow = weeks.find((row) => row.actualized !== undefined);
  if (nextRow?.actualized) nextRow.actualized = { ...nextRow.actualized, next };

  const latestPast = [...weeks].reverse().find((row) => row.actual);
  const status: PerspectiveStatus = track.suspension
    ? "suspended"
    : !last
      ? "insufficient"
      : next?.kind === "consolidate" || (next?.kind === "transition" && isFallback(last, next))
        ? "consolidate"
        : latestPast?.status === "ahead"
          ? "ahead"
          : latestPast?.status === "consolidate"
            ? "consolidate"
            : latestPast?.status === "on_track"
              ? "on_track"
              : track.initial.weeks.length === 0
                ? "insufficient"
                : "on_track";
  return { track, exercise, results, last, next, forecast, status, weeks };
}

/**
 * Une transition est un repli (palier à consolider) quand elle met moins de
 * séries au cran le plus lourd de la dernière séance : hausse ratée. Monter
 * au cran suivant ou y ajouter une série reste une progression.
 */
function isFallback(last: SessionResult, next: DayTarget): boolean {
  const heavy = Math.max(...last.sets.map((set) => set.kg));
  const heavyBefore = last.sets.filter((set) => set.kg === heavy).length;
  return !next.sets.some((set) => (set.kg ?? 0) > heavy) && next.sets.filter((set) => set.kg === heavy).length < heavyBefore;
}
