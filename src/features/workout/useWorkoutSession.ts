import { useCallback, useEffect, useState } from "react";
import type {
  Exercise,
  Id,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import {
  getCompletedWorkouts,
  getInProgressWorkout,
} from "../../db/repositories/workoutRepository";
import { applyWorkoutAction, type WorkoutAction } from "./engine/persistWorkout";
import { findLastPerformances, type LastPerformance } from "./lastPerformance";

export interface WorkoutSessionData {
  workout: WorkoutSession;
  template: SessionTemplate | undefined;
  exerciseById: Map<Id, Exercise>;
  lastByExercise: Map<Id, LastPerformance>;
}

export type WorkoutSessionState =
  | { status: "loading" }
  | { status: "none" }
  | ({ status: "ready" } & WorkoutSessionData);

/**
 * La séance en cours et son contexte de lecture (exercices, modèle,
 * `Dernière fois`). `apply` fait passer un geste par le moteur puis
 * reflète la séance sauvegardée : l'écran ne calcule jamais lui-même.
 */
export function useWorkoutSession(): {
  state: WorkoutSessionState;
  apply: (action: WorkoutAction) => Promise<WorkoutSession | undefined>;
  reload: () => void;
  error: string | undefined;
  clearError: () => void;
} {
  const [state, setState] = useState<WorkoutSessionState>({ status: "loading" });
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [workout, exercises, completed] = await Promise.all([
        getInProgressWorkout(),
        getAllExercises(),
        getCompletedWorkouts(),
      ]);

      if (cancelled) return;

      if (!workout) {
        setState({ status: "none" });
        return;
      }

      const template = workout.sessionTemplateId
        ? await getSessionTemplate(workout.sessionTemplateId)
        : undefined;

      if (cancelled) return;

      setState({
        status: "ready",
        workout,
        template,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
        lastByExercise: findLastPerformances(completed, workout.id),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [version]);

  const apply = useCallback(
    async (action: WorkoutAction) => {
      if (state.status !== "ready") return undefined;

      try {
        setError(undefined);
        const next = await applyWorkoutAction(state.workout.id, action);
        setState({ ...state, workout: next });

        return next;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Geste impossible");

        return undefined;
      }
    },
    [state],
  );

  return { state, apply, reload, error, clearError: () => setError(undefined) };
}

/**
 * Un battement d'affichage par seconde : chaque rendu relit l'horloge et
 * recalcule le restant depuis l'heure de fin cible, jamais par
 * décrément (§12). Rend le numéro du battement, pas une heure figée.
 */
export function useClock(enabled: boolean): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const bump = () => setTick((value) => value + 1);
    const timer = window.setInterval(bump, 1000);

    /* Au retour au premier plan, l'intervalle a pu être ralenti :
       on relit l'horloge tout de suite. */
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled]);

  return tick;
}
