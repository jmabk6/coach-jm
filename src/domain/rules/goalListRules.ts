import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { Goal, GoalSegment, Id, PlannedSession, TestCycleSettings, TestResult, TestScheduleEntry } from "../models";
import type { SegmentEvaluation } from "./goalRules";
import { formatLocalDate, getWeekStartDate, weekdays } from "./programRules";
import { isTestWeek, nextTestWeekStart } from "./testCycleRules";
import { listTestsToReschedule } from "./testPlanRules";

/**
 * Ligne de la liste des objectifs (M4, lot H.3) : numéro, icône, titre,
 * libellé du segment courant, badge, barre, valeur ou « À mesurer »,
 * cible ou « à définir ». Rien n'est stocké : tout se lit sur les
 * objectifs, les résultats de test, les pesées et le calendrier des tests.
 */

export type GoalBadge =
  | { kind: "test"; date: string; label: string }
  | { kind: "reschedule"; label: "À replanifier" }
  | { kind: "weighing"; label: "Pesée demain" | "Pesée du jour" };

/** Le protocole qui mesure un objectif : celui de son segment courant, sinon de ses indicateurs (Jambes). */
export function goalProtocolId(goal: Goal, segment: GoalSegment): Id | undefined {
  if (segment.measure?.source === "test") return segment.measure.protocolId;
  if (segment.measure?.source === "weight_weekly_average") return undefined;
  const indicator = goal.secondaryIndicators.find((item) => item.kind === "test_measure");
  return indicator?.kind === "test_measure" ? indicator.protocolId : undefined;
}

/** « 27 sept. », « 1er oct. ». */
export function formatTestDay(date: string): string {
  const day = parseISO(date);
  const dayOfMonth = day.getDate();
  return `${dayOfMonth === 1 ? "1er" : dayOfMonth} ${format(day, "MMM", { locale: fr })}`;
}

/**
 * Date du prochain test d'un protocole : d'abord une séance planifiée à
 * venir qui le porte (un test replanifié compris), sinon sa place dans la
 * semaine de tests en cours — si le jour n'est pas passé et qu'aucun
 * résultat ne l'a déjà fait — ou dans la suivante.
 */
export function nextTestDate({
  protocolId,
  protocolKey,
  sessions,
  schedule,
  cycle,
  results,
  today,
}: {
  protocolId: Id;
  protocolKey: string;
  sessions: ReadonlyArray<PlannedSession>;
  schedule: ReadonlyArray<TestScheduleEntry>;
  cycle: TestCycleSettings;
  results: ReadonlyArray<Pick<TestResult, "protocolId" | "date">>;
  today: string;
}): string | undefined {
  const planned = sessions
    .filter(
      (session) =>
        session.date >= today &&
        session.removedAt === undefined &&
        (session.status === "upcoming" || session.status === "in_progress") &&
        (session.tests ?? []).some((test) => test.protocolId === protocolId && test.rescheduledToPlannedSessionId === undefined),
    )
    .map((session) => session.date)
    .sort()[0];
  if (planned) return planned;

  const entry = schedule.find((item) => item.protocolKey === protocolKey);
  if (!entry) return undefined;
  const dayOf = (weekStart: string) => formatLocalDate(addDays(parseISO(weekStart), weekdays.indexOf(entry.weekday)));

  const currentWeek = getWeekStartDate(today);
  if (isTestWeek(currentWeek, cycle)) {
    const date = dayOf(currentWeek);
    const weekEnd = formatLocalDate(addDays(parseISO(currentWeek), 6));
    const done = results.some((result) => result.protocolId === protocolId && result.date >= currentWeek && result.date <= weekEnd);
    if (date >= today && !done) return date;
    return dayOf(nextTestWeekStart(formatLocalDate(addDays(parseISO(currentWeek), 7)), cycle));
  }
  return dayOf(nextTestWeekStart(today, cycle));
}

/**
 * Badge d'une ligne : « À replanifier » passe avant la date du prochain
 * test ; le Poids dit si la pesée du jour reste à faire.
 */
export function goalBadge({
  goal,
  segment,
  protocolKey,
  sessions,
  schedule,
  cycle,
  results,
  weighedToday,
  today,
}: {
  goal: Goal;
  segment: GoalSegment;
  protocolKey: string | undefined;
  sessions: ReadonlyArray<PlannedSession>;
  schedule: ReadonlyArray<TestScheduleEntry>;
  cycle: TestCycleSettings | undefined;
  results: ReadonlyArray<Pick<TestResult, "protocolId" | "date">>;
  weighedToday: boolean;
  today: string;
}): GoalBadge | undefined {
  if (segment.measure?.source === "weight_weekly_average") {
    return { kind: "weighing", label: weighedToday ? "Pesée demain" : "Pesée du jour" };
  }

  const protocolId = goalProtocolId(goal, segment);
  if (!protocolId || !protocolKey) return undefined;

  if (listTestsToReschedule(sessions, results, today).some((item) => item.test.protocolId === protocolId)) {
    return { kind: "reschedule", label: "À replanifier" };
  }

  if (!cycle) return undefined;
  const date = nextTestDate({ protocolId, protocolKey, sessions, schedule, cycle, results, today });
  return date ? { kind: "test", date, label: `Test le ${formatTestDay(date)}` } : undefined;
}

export interface GoalRowText {
  /** Sous le titre : le libellé du segment courant (« Assistance minimale → 0 kg »). */
  subtitle: string;
  /** Sous la barre, à gauche : valeur, « À mesurer », ou l'attente d'un indicateur. */
  value: string;
  /** « Palier atteint » ou « Objectif atteint », en vert. */
  reached?: string;
  /** Sous la barre, à droite. */
  target: string;
  /** Barre du segment, bornée à [0, 100]. */
  bar: number;
}

/**
 * Textes d'une ligne (§ 5.1, § 5.1 bis) : le pourcentage est celui du
 * segment courant, préfixé de son nom quand l'objectif en a plusieurs ;
 * à 0 kg, la Traction affiche « Palier atteint », jamais « objectif
 * atteint ».
 */
export function goalRowText(
  goal: Goal,
  segment: GoalSegment,
  evaluation: SegmentEvaluation,
  formatValue: (value: number) => string,
): GoalRowText {
  const steps = goal.segments.length > 1;
  const subtitle = steps && segment.target !== undefined ? `${segment.label} → ${formatValue(segment.target)}` : segment.label;
  const target = segment.target !== undefined ? `Objectif : ${formatValue(segment.target)}` : "Objectif : à définir";

  switch (evaluation.kind) {
    case "no_measure":
      return { subtitle, value: "Indicateur à choisir après 2 tests", target, bar: 0 };
    case "no_result":
      return { subtitle, value: "À mesurer", target, bar: 0 };
    case "untracked":
      return { subtitle, value: formatValue(evaluation.latest.value), target, bar: 0 };
    case "reached":
      return {
        subtitle,
        value: formatValue(evaluation.latest.value),
        reached: evaluation.role === "final" ? "Objectif atteint" : "Palier atteint",
        target,
        bar: 100,
      };
    case "tracking": {
      const percent = `${Math.round(evaluation.percent)} %`;
      return {
        subtitle,
        value: `${formatValue(evaluation.latest.value)} · ${steps ? `${segment.label} : ${percent}` : percent}`,
        target,
        bar: evaluation.bar,
      };
    }
  }
}
