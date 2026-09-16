import { useCallback, useEffect, useState } from "react";
import type {
  Exercise,
  Id,
  PlannedSession,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import {
  getPlannedSessionsBetween,
  getWeeklyProgram,
} from "../../db/repositories/programRepository";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { isFreeWorkoutVisibleInProgram } from "./freeWorkouts";
import {
  calculateSessionTemplateDuration,
  formatSessionTemplateDuration,
} from "../../domain/rules/sessionTemplateRules";
import { generateProgramWeek } from "./generateProgramWeek";

/**
 * Une ligne du planning : une instance planifiée, ou une réalisation libre
 * (faite hors Programme, affichée mais jamais convertie en instance).
 */
export type ProgramEntry =
  | { kind: "planned"; date: string; session: PlannedSession }
  | { kind: "free"; date: string; workout: WorkoutSession };

export interface ProgramData {
  entries: ProgramEntry[];
  templateById: Map<Id, SessionTemplate>;
  exerciseById: Map<Id, Exercise>;
  program: WeeklyProgram | undefined;
  /**
   * `Moyenne 45 min` ou `Estimé 20 min` pour un modèle (§5), la même
   * valeur qu'ailleurs dans l'application.
   */
  durationLabel: (templateId: Id) => string;
}

export type ProgramDataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "success" } & ProgramData);

/**
 * Données d'une plage du Programme : les semaines futures demandées sont
 * d'abord générées à la volée (§9), puis les instances visibles de la
 * plage, les modèles (archives comprises : une instance peut référencer
 * un modèle archivé) et les réalisations qui donnent la durée moyenne.
 *
 * `reload` relance le chargement après chaque action sur une instance.
 */
export function useProgramData(
  startDate: string,
  endDate: string,
  weeksToGenerate: string[],
): { state: ProgramDataState; reload: () => void } {
  const [state, setState] = useState<ProgramDataState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const weeksKey = weeksToGenerate.join(",");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        for (const weekStartDate of weeksKey ? weeksKey.split(",") : []) {
          await generateProgramWeek(weekStartDate);
        }

        const [sessions, templates, exercises, completedWorkouts, program] =
          await Promise.all([
            getPlannedSessionsBetween(startDate, endDate),
            getAllSessionTemplates(),
            getAllExercises(),
            getCompletedWorkouts(),
            getWeeklyProgram(),
          ]);

        if (cancelled) return;

        const templateById = new Map(
          templates.map((template) => [template.id, template]),
        );
        const workoutsByTemplate = groupByTemplate(completedWorkouts);

        const entries: ProgramEntry[] = [
          ...sessions.map((session) => ({
            kind: "planned" as const,
            date: session.date,
            session,
          })),
          ...completedWorkouts
            .filter(
              (workout) =>
                isFreeWorkoutVisibleInProgram(workout) &&
                workout.date >= startDate &&
                workout.date <= endDate,
            )
            .map((workout) => ({
              kind: "free" as const,
              date: workout.date,
              workout,
            })),
        ].sort((a, b) =>
          a.date === b.date
            ? sortKey(a).localeCompare(sortKey(b))
            : a.date.localeCompare(b.date),
        );

        setState({
          status: "success",
          entries,
          templateById,
          exerciseById: new Map(
            exercises.map((exercise) => [exercise.id, exercise]),
          ),
          program,
          durationLabel: (templateId) => {
            const template = templateById.get(templateId);

            if (!template) return "";

            return formatSessionTemplateDuration(
              calculateSessionTemplateDuration(
                template,
                workoutsByTemplate.get(templateId) ?? [],
              ),
            );
          },
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Impossible de charger le Programme",
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, weeksKey, version]);

  return { state, reload };
}

function sortKey(entry: ProgramEntry): string {
  return entry.kind === "planned"
    ? entry.session.createdAt
    : entry.workout.startedAt;
}

function groupByTemplate(
  workouts: WorkoutSession[],
): Map<Id, WorkoutSession[]> {
  const byTemplate = new Map<Id, WorkoutSession[]>();

  for (const workout of workouts) {
    if (!workout.sessionTemplateId) continue;

    const list = byTemplate.get(workout.sessionTemplateId) ?? [];
    list.push(workout);
    byTemplate.set(workout.sessionTemplateId, list);
  }

  return byTemplate;
}
