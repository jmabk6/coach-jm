import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Exercise, Id, SessionTemplate } from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { formatDayLabel } from "../../domain/rules/programRules";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import { isMobilityAssessment } from "../../domain/rules/workoutKindRules";
import { describeWorkoutSummary, hasPerformedBlock, isCountedWorkout } from "./overview";
import { groupWorkoutsByMonth, type HistoryMonth } from "./historyGroups";
import "./Progression.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; months: HistoryMonth[]; templateById: Map<Id, SessionTemplate>; exerciseById: Map<Id, Exercise> };

/**
 * Historique (§14, §16) : toutes les séances terminées, par mois, chaque
 * ligne ouvrant son récapitulatif. Une séance terminée sans aucune
 * réalisation y reste, clairement marquée : elle est hors des
 * statistiques, pas hors de l'histoire.
 */
export function HistoryScreen() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [workouts, templates, exercises] = await Promise.all([
        getCompletedWorkouts(),
        getAllSessionTemplates(),
        getAllExercises(),
      ]);

      if (cancelled) return;

      setState({
        status: "ready",
        months: groupWorkoutsByMonth(workouts),
        templateById: new Map(templates.map((template) => [template.id, template])),
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="progression history">
      <header className="history__nav">
        <Link to="/progression" className="history__back">‹ Progression</Link>
        <h1>Historique</h1>
      </header>

      {state.status === "loading" && <p className="progression__message">Chargement de l'historique…</p>}

      {state.status === "ready" && state.months.length === 0 && (
        <p className="progression__message">Aucune séance terminée pour le moment.</p>
      )}

      {state.status === "ready" &&
        state.months.map((month) => (
          <section key={month.key} className="history__month">
            <h2>
              {month.title}
              <span className="history__month-count">
                {month.workouts.length} séance{month.workouts.length > 1 ? "s" : ""}
              </span>
            </h2>
            <ul className="history__list">
              {month.workouts.map((workout) => {
                const template = workout.sessionTemplateId
                  ? state.templateById.get(workout.sessionTemplateId)
                  : undefined;
                /* La nature réelle prime sur la catégorie du modèle (v1.5, § 11.4). */
                const assessment = isMobilityAssessment(workout);
                const category = assessment ? "Bilan de mobilité" : (template?.category ?? "Musculation");
                const counted = isCountedWorkout(workout);
                const label = formatDayLabel(workout.date);

                return (
                  <li key={workout.id} className={counted || assessment ? undefined : "history__item--empty"}>
                    <Link to={`/workouts/${workout.id}?returnTo=${encodeURIComponent("/historique")}`}>
                      <span className="progression-recent__date">
                        {label.weekday} {label.day}
                      </span>
                      <span className={`progression-recent__icon ${categoryClassName("session-card__icon", category)}`}>
                        <SessionCategoryIcon category={category} size={16} />
                      </span>
                      <span className="history__body">
                        <span className="progression-recent__name">
                          {template?.name ?? "Séance libre"}
                          {!workout.plannedSessionId && template && <small> · supplémentaire</small>}
                        </span>
                        <span className="progression-recent__summary">
                          {counted ? (
                            describeWorkoutSummary(workout, state.exerciseById)
                          ) : assessment ? (
                            /* Un bilan n'est pas une séance ratée : son propre libellé (v1.5, § 3). */
                            <em>Bilan de mobilité{hasPerformedBlock(workout) ? "" : " · aucune mesure"}</em>
                          ) : (
                            <em>Aucune réalisation · hors statistiques</em>
                          )}
                        </span>
                      </span>
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </section>
  );
}
