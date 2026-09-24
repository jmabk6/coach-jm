import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { Goal, GoalSegment, TestResult, WeightEntry } from "../models";
import { formatLocalDate, getWeekStartDate } from "./programRules";
import { weekAverage } from "./weightRules";

/**
 * Calculs des objectifs (conception V2 § 5.1, § 5.1 bis, § 5.2) — fonctions
 * pures. Rien n'est stocké : tout se recalcule à l'affichage.
 *
 * Invariant : les points d'un objectif viennent **uniquement** des
 * résultats de test de la mesure du segment, ou des moyennes
 * hebdomadaires de pesées pour le Poids — jamais d'une séance, d'un jalon
 * ni d'une meilleure performance d'entraînement. Aucune fonction ici ne
 * reçoit de séance.
 */

export interface GoalPoint {
  date: string;
  value: number;
  /** Version du protocole : deux versions ne se relient ni ne se comparent. */
  versionId?: string;
  resultId?: string;
}

/** Valeur d'une mesure dans un résultat : pour une mesure par côté, le côté le moins bon. */
function measureValue(result: Pick<TestResult, "measures">, key: string, direction: GoalSegment["direction"]): number | undefined {
  const found = result.measures.filter((measure) => measure.key === key);
  if (found.length === 0) return undefined;
  if (found.length === 1) return found[0]!.value;
  const values = found.map((measure) => measure.value);
  return direction === "decrease" ? Math.max(...values) : Math.min(...values);
}

/**
 * Points de test d'un segment : résultats **complets** de son protocole qui
 * portent sa mesure, par date. Un résultat incomplet n'entre pas (§ 3.7.3).
 */
export function testPointsFor(segment: GoalSegment, results: ReadonlyArray<TestResult>): GoalPoint[] {
  const measure = segment.measure;
  if (measure?.source !== "test") return [];
  return results
    .filter((result) => result.protocolId === measure.protocolId && result.status === "complete")
    .map((result) => ({ result, value: measureValue(result, measure.measureKey, segment.direction) }))
    .filter((item): item is { result: TestResult; value: number } => item.value !== undefined)
    .map(({ result, value }) => ({ date: result.date, value, versionId: result.versionId, resultId: result.id }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.resultId ?? "").localeCompare(b.resultId ?? ""));
}

export interface WeightPoints {
  /** Semaines complètes (dimanche → samedi) d'au moins 3 pesées, datées de leur samedi. */
  weeks: GoalPoint[];
  /** Semaine en cours : point creux, jamais dans le statut (D9). */
  provisional?: GoalPoint;
}

/** Points du Poids (§ 5.2, § 5.4) : les moyennes hebdomadaires, jamais une pesée seule. */
export function weightPointsFor(entries: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>, today: string): WeightPoints {
  const known = entries.filter((entry) => entry.date <= today);
  if (known.length === 0) return { weeks: [] };

  const currentStart = getWeekStartDate(today);
  const first = getWeekStartDate([...known].sort((a, b) => a.date.localeCompare(b.date))[0]!.date);
  const weeks: GoalPoint[] = [];

  for (let start = first; start < currentStart; start = formatLocalDate(addDays(parseISO(start), 7))) {
    const week = weekAverage(known, start);
    if (week.valid && week.mean !== undefined) weeks.push({ date: week.weekEnd, value: week.mean });
  }

  const current = weekAverage(known, currentStart);
  return current.mean !== undefined && current.count > 0
    ? { weeks, provisional: { date: current.weekEnd, value: current.mean } }
    : { weeks };
}

/* -------------------------------------------------------------------------- */
/* Évaluation d'un segment                                                    */
/* -------------------------------------------------------------------------- */

export type SegmentStatus = "ahead" | "on_track" | "behind";

export type SegmentEvaluation =
  /** Pas de mesure (Jambes avant 2 tests) : statut « — ». */
  | { kind: "no_measure" }
  /** Mesure, mais aucun résultat admissible : « À mesurer ». */
  | { kind: "no_result" }
  /** Résultats, mais cible ou échéance absente : la valeur, statut « — ». */
  | { kind: "untracked"; start: GoalPoint; latest: GoalPoint }
  /** Cible atteinte (§ 5.1 bis) : « Palier atteint » (intermédiaire) ou « Objectif atteint » (final). */
  | { kind: "reached"; role: GoalSegment["role"]; start: GoalPoint; latest: GoalPoint }
  | {
      kind: "tracking";
      start: GoalPoint;
      latest: GoalPoint;
      /** Valeur de la trajectoire à la date du dernier résultat. */
      expected: number;
      status: SegmentStatus;
      /** Écart en semaines, arrondi à 0,5 : positif = en retard. Absent « dans les temps ». */
      weeks?: number;
      /** Pourcentage du segment, non borné (un recul est négatif). */
      percent: number;
      /** Barre bornée à [0, 100]. */
      bar: number;
    };

const days = (from: string, to: string) => differenceInCalendarDays(parseISO(to), parseISO(from));

/** Segment atteint : la cible est tenue dans le sens de l'objectif. */
export function isReached(segment: Pick<GoalSegment, "direction" | "target">, value: number): boolean {
  if (segment.target === undefined || segment.direction === undefined) return false;
  return segment.direction === "decrease" ? value <= segment.target : value >= segment.target;
}

/** Trajectoire (§ 5.1) : de (d₀, S) à (D, C), puis C au-delà de l'échéance. */
export function trajectoryAt(start: GoalPoint, target: number, dueDate: string, date: string): number {
  const span = days(start.date, dueDate);
  if (span <= 0 || date >= dueDate) return target;
  const elapsed = Math.max(0, days(start.date, date));
  return start.value + ((target - start.value) * elapsed) / span;
}

const roundHalf = (value: number) => Math.round(value * 2) / 2;

/**
 * Évalue un segment sur ses points (§ 5.1, § 5.1 bis). Départ S = premier
 * point de la **version du dernier point** (deux versions ne se comparent
 * pas) ; A = dernier point ; D = échéance du segment, sinon de l'objectif.
 */
export function evaluateSegment(
  goal: Pick<Goal, "dueDate">,
  segment: GoalSegment,
  points: ReadonlyArray<GoalPoint>,
): SegmentEvaluation {
  if (!segment.measure) return { kind: "no_measure" };
  if (points.length === 0) return { kind: "no_result" };

  const latest = points[points.length - 1]!;
  const comparable = points.filter((point) => point.versionId === latest.versionId);
  const start = comparable[0]!;

  if (isReached(segment, latest.value)) return { kind: "reached", role: segment.role, start, latest };

  const target = segment.target;
  const dueDate = segment.dueDate ?? goal.dueDate;
  if (target === undefined || dueDate === undefined || segment.direction === undefined) return { kind: "untracked", start, latest };

  const amplitude = Math.abs(target - start.value);
  /* Amplitude nulle : cible tenue au départ, déjà traitée par l'atteinte. */
  if (amplitude === 0) return { kind: "reached", role: segment.role, start, latest };

  const sigma = Math.sign(target - start.value);
  const expected = trajectoryAt(start, target, dueDate, latest.date);
  const gap = sigma * (latest.value - expected);
  const tolerance = 0.05 * amplitude;
  const status: SegmentStatus = gap > tolerance ? "ahead" : gap < -tolerance ? "behind" : "on_track";

  const progress = (latest.value - start.value) / (target - start.value);
  /* `|| 0` : jamais « -0 % » au premier résultat. */
  const percent = Math.round(progress * 100) || 0;
  const bar = Math.min(100, Math.max(0, percent));

  const evaluation: Extract<SegmentEvaluation, { kind: "tracking" }> = { kind: "tracking", start, latest, expected, status, percent, bar };
  if (status !== "on_track") {
    /* t* : date à laquelle la trajectoire vaut A. */
    const onTrackDay = progress * days(start.date, dueDate);
    const weeks = roundHalf((days(start.date, latest.date) - onTrackDay) / 7);
    evaluation.weeks = weeks === 0 ? 0 : weeks;
  }
  return evaluation;
}

/* -------------------------------------------------------------------------- */
/* Courbe (§ 5.2)                                                             */
/* -------------------------------------------------------------------------- */

export interface CurveSeries {
  segmentId: string;
  versionId?: string;
  points: GoalPoint[];
}

export interface GoalCurve {
  /** Un tracé par segment et par version, jamais reliés entre eux. */
  series: CurveSeries[];
  /** Trajectoire du segment courant, de (d₀, S) à (D, C). */
  trajectory?: [GoalPoint, GoalPoint];
  /** Poids : la semaine en cours, en point creux. */
  provisional?: GoalPoint;
}

export function goalCurve(
  goal: Pick<Goal, "segments" | "currentSegmentId" | "dueDate">,
  pointsBySegment: ReadonlyMap<string, ReadonlyArray<GoalPoint>>,
  provisional?: GoalPoint,
): GoalCurve {
  const series: CurveSeries[] = [];
  for (const segment of goal.segments) {
    const points = pointsBySegment.get(segment.id) ?? [];
    const versions = [...new Set(points.map((point) => point.versionId))];
    for (const versionId of versions) {
      series.push({
        segmentId: segment.id,
        ...(versionId !== undefined ? { versionId } : {}),
        points: points.filter((point) => point.versionId === versionId),
      });
    }
  }

  const curve: GoalCurve = { series };
  const current = goal.segments.find((segment) => segment.id === goal.currentSegmentId);
  const evaluation = current ? evaluateSegment(goal, current, pointsBySegment.get(current.id) ?? []) : undefined;
  const dueDate = current?.dueDate ?? goal.dueDate;
  /* Palier atteint : courbe arrêtée, pas de trajectoire (§ 5.1 bis). */
  if (current?.target !== undefined && dueDate && evaluation && evaluation.kind === "tracking") {
    curve.trajectory = [evaluation.start, { date: dueDate, value: current.target }];
  }
  if (provisional) curve.provisional = provisional;
  return curve;
}

/** Libellé d'atteinte (§ 5.1 bis) : jamais « objectif atteint » pour un segment intermédiaire. */
export function reachedLabel(goal: Pick<Goal, "key">, role: GoalSegment["role"]): string {
  if (role === "final") return "Objectif atteint";
  return goal.key === "traction" ? "Palier atteint — prochaine étape : traction stricte" : "Palier atteint";
}
