import type { DayTarget, SetTarget } from "../models";
import type { PerformedSet } from "./progressionRules";

/**
 * Objectif du jour des routines du soir (programme V4, lot L5, spec § 3.4) :
 * un seul suivi par exercice, partagé entre les routines. La cible monte
 * d'un cran (`step`, jusqu'au plafond `max`) quand **toutes les séries** de
 * la séance précédente l'ont atteinte, à RPE ≤ 7, **sans douleur** ; sinon
 * elle reste. Jamais plus d'amplitude : seulement la durée de maintien ou le
 * nombre de répétitions. Les séries par côté comptent pour leur côté le plus
 * faible.
 */

export interface RoutineProgressionRule {
  measure: "reps" | "duration";
  step: number;
  max: number;
  rpeMax: number;
}

/** La dernière séance de l'exercice, dans n'importe quelle routine V4. */
export interface RoutineLastSession {
  workoutId: string;
  /** Cible qui était présentée (objectif figé), ou la consigne de départ si aucune. */
  target: number;
  /** Nombre de séries prévues ce jour-là. */
  sets: number;
  done: PerformedSet[];
  /** Une douleur notée sur une série ou sur la brique. */
  pain: boolean;
}

const unit = (rule: RoutineProgressionRule, value: number) => (rule.measure === "reps" ? `${value} répétitions` : `${value} s`);

export function routineSetTargets(rule: RoutineProgressionRule, sets: number, value: number): SetTarget[] {
  return Array.from({ length: sets }, () => (rule.measure === "reps" ? { reps: value } : { durationSec: value }));
}

export function nextRoutineTarget(input: {
  rule: RoutineProgressionRule;
  /** Séries prévues aujourd'hui (la brique du jour). */
  sets: number;
  /** Consigne de départ de la brique du jour (première séance). */
  start: number;
  last: RoutineLastSession | undefined;
  now: string;
}): DayTarget {
  const { rule, sets, start, last, now } = input;
  const base = { computedAt: now, rpeMax: rule.rpeMax, routine: true as const };
  if (!last) {
    return { ...base, kind: "progress", sets: routineSetTargets(rule, sets, start), reason: `Première séance : ${unit(rule, start)} par série, à RPE ${rule.rpeMax} au plus.` };
  }
  const current = Math.min(last.target, rule.max);
  const keep = (reason: string, kind: DayTarget["kind"] = "consolidate"): DayTarget => ({ ...base, basisWorkoutId: last.workoutId, kind, sets: routineSetTargets(rule, sets, current), reason });
  if (last.pain) return keep("Douleur notée la dernière fois : même cible, sans forcer.");
  if (last.done.length < last.sets) return keep(`Séance précédente incomplète (${last.done.length} séries sur ${last.sets}) : même cible.`);
  if (last.done.some((set) => set.rpe === undefined)) return keep("RPE manquant la dernière fois : même cible, en notant le ressenti.");
  if (last.done.some((set) => set.rpe! > rule.rpeMax)) return keep(`RPE au-dessus de ${rule.rpeMax} la dernière fois : même cible.`);
  const value = (set: PerformedSet) => (rule.measure === "reps" ? set.reps : (set.durationSec ?? 0));
  if (last.done.some((set) => value(set) < current)) return keep("Cible pas atteinte sur toutes les séries : même cible.");
  if (current >= rule.max) return keep(`Plafond de ${unit(rule, rule.max)} atteint : on y reste.`, "repeat");
  const next = Math.min(current + rule.step, rule.max);
  return { ...base, basisWorkoutId: last.workoutId, kind: "progress", sets: routineSetTargets(rule, sets, next), reason: `Toutes les séries réussies à RPE ${rule.rpeMax} au plus : +${rule.measure === "reps" ? `${rule.step} répétition${rule.step > 1 ? "s" : ""}` : `${rule.step} s`}.` };
}
