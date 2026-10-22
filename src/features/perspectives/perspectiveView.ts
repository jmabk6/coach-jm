import type { DayTarget, Exercise, Id, PlanWeek, ProgressionTrack, SetTarget, WorkoutSession } from "../../domain";
import { PERSPECTIVE_HORIZON } from "../../domain";
import {
  BAND_HIGH,
  BAND_LOW,
  estimatePace,
  mondayOf,
  PACE_KNOWN_FROM,
  sessionLevel,
  sessionMeanDuration,
  sessionMeanLevel,
  simulateDurationPlan,
  simulateLoadPlan,
  trackResults,
  weeklyLevels,
  weekStatus,
  workSetsOf,
  type PerformedSet,
  type SessionResult,
  type WeekStatus,
} from "../../domain/rules/progressionRules";
import { v6State } from "../goals/tractionV6";
import { dayTargetForTrack, type DayTargetContext } from "./dayTargets";
import { planStartWeek, sourceIdsOf, type TrackSpec } from "./tracks";

/**
 * Perspectives au 31 mars (lot P3, 22/10/2026) : la vue d'une piste.
 * Repères jamais confondus :
 * - **repère initial** (22/10) : trajectoire de départ, au sens d'origine —
 *   une meilleure série, pas un objectif par série (jamais réécrit) ;
 * - **référence détaillée** (correction du 22/10) : l'objectif de chaque
 *   série semaine par semaine, datée, jamais réécrite ;
 * - **présenté** : l'objectif du jour figé sur la séance de cette semaine ;
 * - **réel** : ce qui a été noté ; **en cours** : noté dans une séance ouverte ;
 * - **actualisé** : pour les semaines à venir, l'objectif complet de chaque
 *   séance, recalculé aujourd'hui (jamais stocké).
 * Une semaine à venir n'a jamais de statut réussi ou raté.
 */

export type PerspectiveStatus = "ahead" | "on_track" | "consolidate" | "insufficient" | "suspended";

/** Statut d'une semaine ; « séance en cours » : exercice noté dans une séance pas encore enregistrée. */
export type WeekRowStatus = WeekStatus | "in_session";

export interface WeekRow {
  /** Lundi de la semaine. */
  week: string;
  /** Repère initial : meilleure série (sens d'origine). */
  initial?: SetTarget | undefined;
  /** Référence détaillée : chaque série. */
  reference?: PlanWeek | undefined;
  presented?: DayTarget | undefined;
  /** Semaines à venir : objectif complet ; `next` pour la prochaine séance (règles sur tes séances réelles). */
  /**
   * Semaines à venir : objectif complet. `next` : la prochaine séance,
   * proposée par les règles sur tes séances réelles (jamais jugée
   * d'avance). `repeat` : même objectif que la semaine d'avant, reconduit
   * par la simulation interne. `toRefine` : rythme encore
   * inconnu, pas d'objectif au-delà de la prochaine séance.
   */
  actualized?: { sets: SetTarget[]; next: boolean; repeat: boolean } | { toRefine: true } | undefined;
  actual?: SessionResult | undefined;
  /** Séries déjà notées dans la séance en cours. */
  ongoing?: PerformedSet[] | undefined;
  status: WeekRowStatus;
}

export interface PerspectiveForecast {
  /** Au 31 mars : la dernière séance simulée atteinte, série par série (répétitions faites). */
  probable: SetTarget[];
  low: SetTarget[];
  high: SetTarget[];
  /** Provisoire tant que moins de `PROVISIONAL_BELOW` semaines comptent une séance comparable. */
  provisional: boolean;
  /** Semaines distinctes avec au moins une séance comparable (deux séances la même semaine comptent pour une). */
  weeksWithSession: number;
  /** Rythme retenu et brut, pour l'explication des hypothèses. */
  paceWeekly: number;
  paceRaw?: number | undefined;
}

export interface PerspectiveView {
  /** Plafond de RPE de la piste (affichage des objectifs). */
  rpeMax?: number | undefined;
  /** Semaines distinctes avec une séance comparable ; sous 3, le rythme est inconnu. */
  paceWeeks?: number | undefined;
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
  const pace = estimatePace(weeklyLevels(results, sessionMeanLevel));
  const steps = exercise?.loadSteps;
  const rpeMax = spec?.load?.rpeMax ?? spec?.duration?.rpeMax;
  const ongoing = ongoingSets(allWorkouts, sourceIds, thisWeek);

  /* Objectifs complets semaine par semaine : probable, fourchette basse et haute (rythme × 0,4 et × 1,3). */
  const first = next && next.sets.length > 0 ? next : undefined;
  const planFrom = planStartWeek(last, today);
  /* Rythme inconnu (pas nul) : seule la prochaine séance est projetée ; au-delà, « prévision à affiner ». */
  const paceKnown = pace.points >= PACE_KNOWN_FROM;
  const until = paceKnown ? PERSPECTIVE_HORIZON : planFrom;
  const plan = (factor: number): PlanWeek[] | undefined => {
    if (track.suspension || !last) return undefined;
    if (track.engine === "load" && spec?.load && steps) {
      return simulateLoadPlan({ history: results, prescription: spec.load, steps, pace: pace.weekly * factor, fromWeek: planFrom, until, first });
    }
    if (track.engine === "duration" && spec?.duration) {
      return simulateDurationPlan({ last, prescription: spec.duration, fromWeek: planFrom, until, first });
    }
    return undefined;
  };
  const probable = plan(1);
  const low = track.engine === "load" ? plan(BAND_LOW) : probable;
  const high = track.engine === "load" ? plan(BAND_HIGH) : probable;
  const planByWeek = new Map((probable ?? []).map((week) => [week.week, week]));
  const forecast: PerspectiveForecast | undefined =
    paceKnown && probable?.length && low?.length && high?.length
      ? { probable: lastDone(probable), low: lastDone(low), high: lastDone(high), provisional: pace.provisional, weeksWithSession: pace.points, paceWeekly: pace.weekly, paceRaw: pace.raw }
      : undefined;

  const referenceByWeek = new Map((track.detailed?.weeks ?? []).map((week) => [week.week, week]));
  const referenceFrom = track.detailed?.weeks[0]?.week;
  const weeks: WeekRow[] = [];
  for (let week = fromWeek; week <= PERSPECTIVE_HORIZON; week = addDays(week, 7)) {
    const initial = initialByWeek.get(week);
    const reference = referenceByWeek.get(week);
    const actual = resultsByWeek.get(week);
    /* Exercice déjà noté dans la séance ouverte : la ligne « En cours » remplace l'objectif actualisé. */
    const inSession = week === thisWeek && !actual && ongoing.length > 0;
    const planned = week >= planFrom && !actual && !inSession ? planByWeek.get(week) : undefined;
    const suspended = track.suspension !== undefined && week >= mondayOf(track.suspension.from);
    /* Comparaison : référence détaillée (toutes les séries) dès qu'elle couvre la semaine ; avant, repère initial (meilleure série). */
    const byReference = referenceFrom !== undefined && week >= referenceFrom;
    const actualLevel = actual ? (byReference ? (track.engine === "duration" ? sessionMeanDuration(actual) : sessionMeanLevel(actual)) : sessionLevel(actual)) : undefined;
    const status: WeekRowStatus =
      inSession
        ? "in_session"
        : weekStatus({ week, today, initialLevel: byReference ? reference?.level : initial?.level, actualLevel, suspended });
    weeks.push({
      week,
      initial: initial?.probable,
      reference,
      presented: presented.get(week),
      actualized: planned
        ? { sets: planned.sets, next: week === planFrom, repeat: week !== planFrom && samePlan(planByWeek.get(addDays(week, -7))?.sets, planned.sets) }
        : week > planFrom && !actual && probable && !paceKnown
          ? { toRefine: true }
          : undefined,
      actual,
      ...(week === thisWeek && ongoing.length > 0 ? { ongoing } : {}),
      status,
    });
  }

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
              : track.initial.weeks.length === 0 && !track.detailed
                ? "insufficient"
                : "on_track";
  return { track, exercise, results, last, next, forecast, status, weeks, rpeMax, paceWeeks: pace.points };
}

/** Deux objectifs complets identiques, série par série. */
function samePlan(a: ReadonlyArray<SetTarget> | undefined, b: ReadonlyArray<SetTarget>): boolean {
  return a !== undefined && a.length === b.length && a.every((set, index) => set.kg === b[index]!.kg && set.reps === b[index]!.reps && set.stretch === b[index]!.stretch && set.step === b[index]!.step);
}

/** La dernière séance simulée jugée réalisable (estimation de ce que tu ferais), sinon l'objectif de la dernière semaine. */
function lastDone(plan: ReadonlyArray<PlanWeek>): SetTarget[] {
  return [...plan].reverse().find((week) => week.done)?.done ?? plan.at(-1)!.sets;
}

/** Les séries de travail déjà notées pour la piste dans la séance en cours de la semaine. */
function ongoingSets(workouts: ReadonlyArray<WorkoutSession>, sourceIds: ReadonlyArray<Id>, week: string): PerformedSet[] {
  const wanted = new Set(sourceIds);
  const current = workouts.find((workout) => workout.status === "in_progress" && mondayOf(workout.date) === week);
  const block = current?.blocks.find((item) => item.kind === "exercise" && item.sourceBlockId !== undefined && wanted.has(item.sourceBlockId));
  return block?.kind === "exercise" ? workSetsOf(block) : [];
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
