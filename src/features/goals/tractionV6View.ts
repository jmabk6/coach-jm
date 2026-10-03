import { addDays, format, parseISO } from "date-fns";
import type { WeightEntry, WorkoutSession } from "../../domain";
import { getWeekStartDate } from "../../domain/rules/programRules";
import { betSessions, type BetSession } from "./tractionBet";
import {
  effectiveLoad, V6_REFERENCE, V6_START_DATE, V6_STEP_KG, v6Color, v6EarlyFreeTry, v6ForceSession, v6LightSession, v6State, v6WeekOf,
  v6WeightGuard, type V6Color, type V6ForceSession, type V6State, type V6TestResultLike, type V6Week,
} from "./tractionV6";

/**
 * L'écran Objectif Traction en V6 (04/10/2026) : la référence fixe S1-S26
 * face au réel. Le statut ne dépend que de l'écart de paliers (§ 15) ; les
 * reps se comparent à la référence seulement à aide identique et ne
 * changent jamais la couleur ; jamais d'écart en semaines.
 */

type Weights = ReadonlyArray<Pick<WeightEntry, "date" | "kg">>;

export type V6RowState = "past" | "now" | "upcoming";

export interface V6Row {
  week: V6Week;
  state: V6RowState;
  /** Passé et semaine en cours : palier A réel en fin de semaine (ou aujourd'hui) et sa couleur. */
  aKg?: number;
  color?: V6Color;
  /** Le dimanche de force de la semaine (le jour de test n'en est pas un). */
  session?: BetSession;
  /** Le palier A au moment de cette séance. */
  sessionAKg?: number;
  /** Reps de la séance au palier A, face aux reps de référence, quand l'aide est la même. */
  compare?: { real: number[]; ref: readonly number[] };
  repli?: boolean;
  validatedKg?: number;
  regression?: boolean;
  testKg?: number;
  weightKg?: number;
}

export interface V6Progress {
  today: string;
  state: V6State;
  week: V6Week;
  color: V6Color;
  statusLabel: string;
  next: V6ForceSession;
  light: ReturnType<typeof v6LightSession>;
  weight?: { date: string; kg: number };
  effectiveKg?: number;
  guard?: string;
  earlyTry?: string;
  rows: V6Row[];
}

const saturdayOf = (sunday: string) => format(addDays(parseISO(sunday), 6), "yyyy-MM-dd");
const dayBefore = (date: string) => format(addDays(parseISO(date), -1), "yyyy-MM-dd");

/** « Conforme à la référence », « En avance… », « 1 cran plus assisté que la référence (28 kg) ». */
export function v6StatusLabel(state: V6State, date: string): string {
  if (state.phase === "gagne") return "Objectif gagné";
  const ref = v6WeekOf(date).refKg;
  const crans = (state.aKg - ref) / V6_STEP_KG;
  if (crans < 0) return "En avance sur la référence";
  if (crans === 0) return "Conforme à la référence";
  return `${crans} cran${crans > 1 ? "s" : ""} plus assisté que la référence (${ref} kg)`;
}

/**
 * Le statut en un mot (Accueil, liste, carte « Statut ») : l'écart de
 * paliers seulement — « Conforme », « En avance », « 1 cran derrière ».
 */
export function v6ShortStatus(state: V6State, date: string): { label: string; tone: "ahead" | "on_track" | "warning" | "behind" | "reached" } {
  if (state.phase === "gagne") return { label: "Atteint", tone: "reached" };
  const crans = (state.aKg - v6WeekOf(date).refKg) / V6_STEP_KG;
  if (crans < 0) return { label: "En avance", tone: "ahead" };
  if (crans === 0) return { label: "Conforme", tone: "on_track" };
  return { label: `${crans} cran${crans > 1 ? "s" : ""} derrière`, tone: crans === 1 ? "warning" : "behind" };
}

export function v6Progress(workouts: readonly WorkoutSession[], weights: Weights, today: string, results: readonly V6TestResultLike[] = []): V6Progress {
  const state = v6State(workouts, today, results);
  const week = v6WeekOf(today);
  const sessions = betSessions(workouts).filter((session) => session.date >= V6_START_DATE && session.date <= today);
  const weight = [...weights].filter((entry) => entry.date <= today).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const effectiveKg = state.phase === "gagne" ? undefined : effectiveLoad(weight?.kg, state.aKg);
  const guard = v6WeightGuard(state, weights);
  const earlyTry = v6EarlyFreeTry(state, weights);

  const rows = V6_REFERENCE.map((item): V6Row => {
    const saturday = saturdayOf(item.date);
    const rowState: V6RowState = today > saturday ? "past" : today >= item.date ? "now" : "upcoming";
    if (rowState === "upcoming") return { week: item, state: rowState };

    const until = rowState === "now" ? today : saturday;
    const atEnd = v6State(workouts, until, results);
    const row: V6Row = { week: item, state: rowState, aKg: atEnd.aKg, color: v6Color(atEnd, until) };

    const session = sessions.find((candidate) => candidate.date >= item.date && candidate.date <= saturday);
    if (session) {
      const sessionAKg = v6State(workouts, dayBefore(session.date), results).aKg;
      row.session = session;
      row.sessionAKg = sessionAKg;
      const events = atEnd.events.filter((event) => event.workoutId === session.workoutId);
      if (events.some((event) => event.kind === "repli")) row.repli = true;
      if (events.some((event) => event.kind === "regression")) row.regression = true;
      const validation = events.find((event) => event.kind === "validation");
      if (validation?.detail) row.validatedKg = Number.parseFloat(validation.detail);
      if (item.refReps && sessionAKg === item.refKg) {
        row.compare = { real: session.sets.filter((set) => set.assistKg === sessionAKg).map((set) => set.reps), ref: item.refReps };
      }
    }

    const test = results
      .filter((result) => result.protocolId === "protocol-traction" && getWeekStartDate(result.date) === item.date && result.date <= today)
      .map((result) => result.measures.find((measure) => measure.key === "assistance_min_kg")?.value)
      .find((value) => value !== undefined);
    if (test !== undefined) row.testKg = test;

    const weekWeight = [...weights].filter((entry) => entry.date >= item.date && entry.date <= until).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (weekWeight) row.weightKg = weekWeight.kg;
    return row;
  });

  return {
    today,
    state,
    week,
    color: v6Color(state, today),
    statusLabel: v6StatusLabel(state, today),
    next: v6ForceSession(state),
    light: v6LightSession(state, today),
    ...(weight ? { weight: { date: weight.date, kg: weight.kg } } : {}),
    ...(effectiveKg !== undefined ? { effectiveKg } : {}),
    ...(guard ? { guard } : {}),
    ...(earlyTry ? { earlyTry } : {}),
    rows,
  };
}
