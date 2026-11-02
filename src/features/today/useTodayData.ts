import { useCallback, useEffect, useState } from "react";
import { loadTestNames } from "../tests/testRecapCards";
import { addDays, parseISO } from "date-fns";
import type {
  Exercise,
  Id,
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { practiceLockOf } from "../../domain/rules/exerciseClearanceRules";
import {
  getPlannedSessionsBetween,
  getPlannedSessionsByDate,
  getWeeklyProgram,
} from "../../db/repositories/programRepository";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import {
  getCompletedWorkouts,
  getInProgressWorkout,
  getPendingWorkout,
  getWorkoutsByDate,
} from "../../db/repositories/workoutRepository";
import {
  formatLocalDate,
  getWeekdayOf,
  getWeekStartDate,
} from "../../domain/rules/programRules";
import {
  calculateSessionTemplateDuration,
  durationCompletions,
  type SessionTemplateDuration,
} from "../../domain/rules/sessionTemplateRules";
import {
  getTodayState,
  listNextPlannedSessions,
  type TodayState,
} from "../../domain/rules/todayRules";
import { generateProgramWeek } from "../program/generateProgramWeek";

/** Une séance facultative du jour (programme V4 : la récupération douce du samedi). */
export interface OptionalSession {
  template: SessionTemplate;
}

/** Les séances facultatives d'aujourd'hui (règle hebdomadaire V4), sauf celles déjà faites ou en cours aujourd'hui. */
export function optionalSessionsFor(
  optionalIds: ReadonlyArray<Id>,
  templateById: ReadonlyMap<Id, SessionTemplate>,
  workoutsToday: ReadonlyArray<Pick<WorkoutSession, "sessionTemplateId">>,
): OptionalSession[] {
  return optionalIds.flatMap((id): OptionalSession[] => {
    const template = templateById.get(id);
    if (!template || template.status !== "active") return [];
    if (workoutsToday.some((workout) => workout.sessionTemplateId === id)) return [];
    return [{ template }];
  });
}

/**
 * Horizon des `Prochaines séances` : les deux semaines qui viennent.
 */
const NEXT_SESSIONS_HORIZON_DAYS = 14;

export interface TodayData {
  today: string;
  state: TodayState;
  nextSessions: PlannedSession[];
  templateById: Map<Id, SessionTemplate>;
  exerciseById: Map<Id, Exercise>;
  activeTemplates: SessionTemplate[];
  /** Nom des protocoles, pour les tests attachés à une séance du jour (lot J.1). */
  testNameById: Map<Id, string>;
  /** Séance terminée, pas encore enregistrée : elle n'empêche pas d'en démarrer une autre. */
  pendingWorkout?: WorkoutSession;
  /** Programme V4 : séances facultatives du jour (samedi : récupération douce). */
  optional: OptionalSession[];
  /**
   * Durée d'un modèle et nombre de réalisations qui la fondent,
   * la même valeur que sur l'écran Séances (§5).
   */
  durationOf: (templateId: Id) => {
    duration: SessionTemplateDuration;
    completionCount: number;
  } | undefined;
}

export type TodayDataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "success" } & TodayData);

export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

function shiftDate(date: string, days: number): string {
  return formatLocalDate(addDays(parseISO(date), days));
}

/**
 * Données d'Aujourd'hui : l'état du jour (§10), les prochaines séances
 * (la semaine suivante est générée à la volée si la règle l'exige, comme
 * dans le Programme), les modèles pour `Choisir une séance`.
 */
export function useTodayData(): { state: TodayDataState; reload: () => void } {
  const [state, setState] = useState<TodayDataState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const today = todayLocalDate();
        const horizonEnd = shiftDate(today, NEXT_SESSIONS_HORIZON_DAYS);

        await generateProgramWeek(getWeekStartDate(shiftDate(today, 7)));

        const [
          plannedToday,
          plannedAhead,
          workoutsToday,
          inProgressWorkout,
          templates,
          exercises,
          completedWorkouts,
          pendingWorkout,
          testNameById,
          program,
        ] = await Promise.all([
          getPlannedSessionsByDate(today),
          getPlannedSessionsBetween(shiftDate(today, 1), horizonEnd),
          getWorkoutsByDate(today),
          getInProgressWorkout(),
          getAllSessionTemplates(),
          getAllExercises(),
          getCompletedWorkouts(),
          getPendingWorkout(),
          loadTestNames(),
          getWeeklyProgram(),
        ]);

        if (cancelled) return;

        const templateById = new Map(
          templates.map((template) => [template.id, template]),
        );
        const completedByTemplate = new Map<Id, WorkoutSession[]>();

        for (const workout of completedWorkouts) {
          if (!workout.sessionTemplateId) continue;

          const list = completedByTemplate.get(workout.sessionTemplateId) ?? [];
          list.push(workout);
          completedByTemplate.set(workout.sessionTemplateId, list);
        }

        /* Lot L2 : exercices « À valider » ou « Suspendus ». */
        const lockedIds = new Set(exercises.filter((exercise) => practiceLockOf(exercise)).map((exercise) => exercise.id));

        setState({
          status: "success",
          today,
          state: getTodayState({
            today,
            plannedSessions: plannedToday,
            workouts: workoutsToday,
            ...(inProgressWorkout ? { inProgressWorkout } : {}),
          }),
          /* Les routines du soir (lot K.2) ne sont pas des « prochaines séances ». */
          nextSessions: listNextPlannedSessions(
            plannedAhead.filter((session) => session.slot !== "evening"),
            today,
          ),
          testNameById,
          optional: optionalSessionsFor(program?.optionalByWeekday?.[getWeekdayOf(today)] ?? [], templateById, workoutsToday),
          ...(pendingWorkout ? { pendingWorkout } : {}),
          templateById,
          exerciseById: new Map(
            exercises.map((exercise) => [exercise.id, exercise]),
          ),
          activeTemplates: templates
            .filter((template) => template.status === "active")
            .sort((a, b) => a.position - b.position),
          durationOf: (templateId) => {
            /* Lot L2 : les exercices verrouillés ne comptent pas dans l'estimation. */
            const template = templateById.get(templateId);

            if (!template) return undefined;

            const completed = completedByTemplate.get(templateId) ?? [];

            return {
              duration: calculateSessionTemplateDuration(template, completed, lockedIds),
              completionCount: durationCompletions(template, completed).length,
            };
          },
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Impossible de charger la journée",
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [version]);

  return { state, reload };
}
