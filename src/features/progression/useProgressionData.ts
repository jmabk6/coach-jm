import { useEffect, useState } from "react";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getPlannedSessionsBetween } from "../../db/repositories/programRepository";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { formatLocalDate } from "../../domain/rules/programRules";
import type { ProgressionSources } from "./overview";
import { PERIOD_DAYS } from "./period";

/**
 * Sources brutes de Progression : toutes les séances terminées (les
 * agrégats recalculent tout, aucune valeur dérivée n'est stockée), les
 * instances planifiées de la plus longue période et de sa précédente,
 * modèles et exercices. `today` est figé au chargement.
 */
export type ProgressionDataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; today: string; sources: ProgressionSources };

export function useProgressionData(): ProgressionDataState {
  const [state, setState] = useState<ProgressionDataState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const today = formatLocalDate(new Date());
        const horizon = new Date();
        horizon.setDate(horizon.getDate() - 2 * PERIOD_DAYS["1y"]);

        const [workouts, plannedSessions, templates, exercises] = await Promise.all([
          getCompletedWorkouts(),
          getPlannedSessionsBetween(formatLocalDate(horizon), today),
          getAllSessionTemplates(),
          getAllExercises(),
        ]);

        if (cancelled) return;

        setState({ status: "ready", today, sources: { workouts, plannedSessions, templates, exercises } });
      } catch (cause) {
        if (!cancelled) {
          setState({ status: "error", message: cause instanceof Error ? cause.message : "Chargement impossible" });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
