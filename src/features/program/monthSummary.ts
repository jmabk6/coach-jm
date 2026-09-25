import { addDays, addMonths, parseISO } from "date-fns";
import type { Exercise, Id, SessionTemplate, WorkoutSession } from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { isCountedWorkout } from "./countedWorkouts";
import { categoryForWorkout } from "./freeWorkouts";

/**
 * Résumé du mois (conception V2 § 5.8, D23, N8) — fonction pure.
 *
 * - Périmètre : séances confirmées du mois civil, comptées selon
 *   `isCountedWorkout` (les bilans de mobilité n'y entrent pas).
 * - Lignes Musculation, Cardio, Routine, selon la catégorie du modèle ;
 *   une séance libre sans modèle prend la catégorie inférée, où une brique
 *   `warmup` ne fait jamais une séance cardio.
 * - Mobilité (N8) : dans aucune ligne, mais comptée dans le total et dans
 *   les jours actifs — l'écart reste visible (total > somme des lignes).
 * - Jours sans séance : jours écoulés du mois (jusqu'à hier pour le mois
 *   en cours) sans aucune séance comptée.
 */
export interface MonthSummary {
  total: number;
  musculation: number;
  cardio: number;
  routine: number;
  /** Comptées au total, dans aucune ligne (N8). */
  mobility: number;
  daysWithoutSession: number;
  /** Jours écoulés pris en compte (0 pour un mois futur). */
  elapsedDays: number;
}

export function summarizeMonth(
  workouts: ReadonlyArray<WorkoutSession>,
  monthStart: string,
  today: string,
  templateById: ReadonlyMap<Id, SessionTemplate>,
  exerciseById: Map<Id, Exercise>,
): MonthSummary {
  const month = monthStart.slice(0, 7);
  const monthEnd = formatLocalDate(addDays(addMonths(parseISO(`${month}-01`), 1), -1));
  const counted = workouts.filter((workout) => workout.date.slice(0, 7) === month && isCountedWorkout(workout));

  const summary: MonthSummary = {
    total: counted.length,
    musculation: 0,
    cardio: 0,
    routine: 0,
    mobility: 0,
    daysWithoutSession: 0,
    elapsedDays: 0,
  };

  for (const workout of counted) {
    const template = workout.sessionTemplateId ? templateById.get(workout.sessionTemplateId) : undefined;
    switch (categoryForWorkout(workout, template, exerciseById)) {
      case "Musculation":
        summary.musculation += 1;
        break;
      case "Cardio":
        summary.cardio += 1;
        break;
      case "Routine":
        summary.routine += 1;
        break;
      case "Mobilité":
        summary.mobility += 1;
        break;
      case "Bilan de mobilité":
        /* Exclus par `isCountedWorkout` ; jamais atteint. */
        break;
    }
  }

  /* Dernier jour écoulé : la fin du mois passé, hier pour le mois en cours. */
  const lastElapsed = monthEnd < today ? monthEnd : formatLocalDate(addDays(parseISO(today), -1));
  const activeDays = new Set(counted.map((workout) => workout.date));

  for (let date = `${month}-01`; date <= lastElapsed; date = formatLocalDate(addDays(parseISO(date), 1))) {
    summary.elapsedDays += 1;
    if (!activeDays.has(date)) summary.daysWithoutSession += 1;
  }

  return summary;
}
