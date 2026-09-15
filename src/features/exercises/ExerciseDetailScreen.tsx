import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Exercise } from "../../domain";
import {
  getActiveExercises,
  getExercise,
} from "../../db/repositories/exerciseRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  getCompatiblePerformanceMetrics,
  getDefaultPerformanceMetric,
  getPerformanceMetricValue,
  type ExercisePerformanceEntry,
  type ExercisePerformanceMetric,
} from "./exercisePerformance";
import { ExerciseDemonstration } from "./ExerciseDemonstration";
import "./ExerciseDetailScreen.css";

type LoadState =
  | { status: "loading" }
  | {
      status: "success";
      exercise: Exercise;
      allExercises: Exercise[];
      performanceHistory: ExercisePerformanceEntry[];
    }
  | { status: "not-found" }
  | { status: "error"; message: string };

const metricLabels: Record<
  ExercisePerformanceMetric,
  string
> = {
  chargeMax: "Charge max",
  volume: "Volume",
  reps: "Répétitions",
  durationMax: "Durée max",
  distanceCm: "Distance",
};

function formatMetricValue(
  value: number,
  metric: ExercisePerformanceMetric,
): string {
  switch (metric) {
    case "chargeMax":
      return `${Math.round(value * 10) / 10} kg`;

    case "volume":
      return `${Math.round(value)} kg`;

    case "reps":
      return `${Math.round(value)} reps`;

    case "durationMax":
      return `${Math.round(value)} s`;

    case "distanceCm":
      return `${Math.round(value * 10) / 10} cm`;
  }
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

export function ExerciseDetailScreen() {
  const navigate = useNavigate();
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const selectionMode =
    searchParams.get("mode") === "select";

  /* Retour vers la liste telle qu'on l'a quittée (filtres, recherche, tri). */
  const cameFrom = (location.state as { from?: string } | null)?.from;
  const exercisesBackTarget =
    cameFrom ??
    (selectionMode ? `/exercises?${searchParams.toString()}` : "/exercises");

  const [state, setState] = useState<LoadState>({
    status: "loading",
  });

  const [selectedMetric, setSelectedMetric] =
    useState<ExercisePerformanceMetric | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!exerciseId) {
        setState({ status: "not-found" });
        return;
      }

      try {
        const [exercise, allExercises, workouts] =
          await Promise.all([
            getExercise(exerciseId),
            getActiveExercises(),
            getCompletedWorkouts(),
          ]);

        if (cancelled) {
          return;
        }

        if (!exercise || exercise.status !== "active") {
          setState({ status: "not-found" });
          return;
        }

        const performanceHistory =
          buildExercisePerformanceHistory(
            exercise,
            workouts,
          );

        setSelectedMetric(
          getDefaultPerformanceMetric(exercise),
        );

        setState({
          status: "success",
          exercise,
          allExercises,
          performanceHistory,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Impossible de charger l'exercice.",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const alternatives = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }

    const pinnedIds = new Set(
      state.exercise.pinnedAlternativeExerciseIds ?? [],
    );

    const pinned = state.allExercises
      .filter(
        (candidate) =>
          candidate.id !== state.exercise.id &&
          pinnedIds.has(candidate.id),
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );

    const automatic = state.allExercises
      .filter(
        (candidate) =>
          candidate.id !== state.exercise.id &&
          !pinnedIds.has(candidate.id) &&
          state.exercise.category === "Musculation" &&
          candidate.category === "Musculation" &&
          candidate.zone === state.exercise.zone &&
          candidate.movement === state.exercise.movement &&
          candidate.equipment !== state.exercise.equipment,
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );

    return [...pinned, ...automatic];
  }, [state]);

  const compatibleMetrics = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }

    return getCompatiblePerformanceMetrics(
      state.exercise,
    );
  }, [state]);

  const performanceSummary = useMemo(() => {
    if (
      state.status !== "success" ||
      !selectedMetric
    ) {
      return undefined;
    }

    return buildExercisePerformanceSummary(
      state.performanceHistory,
      selectedMetric,
    );
  }, [state, selectedMetric]);

  if (state.status === "loading") {
    return (
      <section className="exercise-detail">
        <p>Chargement de l'exercice...</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="exercise-detail">
        <button
          type="button"
          className="exercise-detail__back"
          onClick={() => navigate(exercisesBackTarget)}
        >
          ← Exercices
        </button>

        <h1>Erreur</h1>
        <p>{state.message}</p>
      </section>
    );
  }

  if (state.status === "not-found") {
    return (
      <section className="exercise-detail">
        <button
          type="button"
          className="exercise-detail__back"
          onClick={() => navigate(exercisesBackTarget)}
        >
          ← Exercices
        </button>

        <h1>Exercice introuvable</h1>
      </section>
    );
  }

  const {
    exercise,
    performanceHistory,
  } = state;

  const chartData = selectedMetric
    ? performanceHistory
        .map((entry) => {
          const value = getPerformanceMetricValue(
            entry,
            selectedMetric,
          );

          if (value === undefined) {
            return null;
          }

          return {
            date: entry.date,
            label: formatDate(entry.date),
            value,
          };
        })
        .filter(
          (
            point,
          ): point is {
            date: string;
            label: string;
            value: number;
          } => point !== null,
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const hasPerformance =
    performanceSummary !== undefined;

  /* Une rubrique vide n'est pas affichée : pas de placeholders dans la fiche. */
  const hasPedagogy =
    Boolean(exercise.technique) ||
    Boolean(exercise.description) ||
    Boolean(exercise.advice) ||
    (exercise.muscles !== undefined && exercise.muscles.length > 0);

  return (
    <section className="exercise-detail">
      <button
        type="button"
        className="exercise-detail__back"
        onClick={() => navigate(exercisesBackTarget)}
      >
        ← Exercices
      </button>

      <header className="exercise-detail__header">
        <div className="exercise-detail__title-row">
          <h1>{exercise.name}</h1>

          <button
            type="button"
            className="exercise-detail__edit-button"
            onClick={() =>
              navigate(`/exercises/${exercise.id}/edit`)
            }
          >
            Modifier
          </button>
        </div>

        <div className="exercise-detail__tags">
          {exercise.category === "Musculation" ? (
            <>
              <span>{exercise.zone}</span>
              <span>{exercise.movement}</span>
              <span>{exercise.equipment}</span>
            </>
          ) : exercise.category === "Cardio" ? (
            <>
              <span>{exercise.category}</span>
              <span>{exercise.equipment}</span>
              <span>{exercise.location}</span>
            </>
          ) : (
            <>
              <span>{exercise.category}</span>
              <span>{exercise.location}</span>
            </>
          )}
        </div>
      </header>

      <section className="exercise-detail__media">
        <ExerciseDemonstration exercise={exercise} />
      </section>

      {hasPerformance && (
        <section className="exercise-detail__section">
          <div className="exercise-detail__section-heading">
            <h2>Mes performances</h2>

            {compatibleMetrics.length > 1 &&
              selectedMetric && (
                <select
                  className="exercise-detail__metric-select"
                  value={selectedMetric}
                  onChange={(event) =>
                    setSelectedMetric(
                      event.target
                        .value as ExercisePerformanceMetric,
                    )
                  }
                  aria-label="Métrique de performance"
                >
                  {compatibleMetrics.map((metric) => (
                    <option
                      key={metric}
                      value={metric}
                    >
                      {metricLabels[metric]}
                    </option>
                  ))}
                </select>
              )}
          </div>

          <div className="exercise-detail__performance-cards">
            <article className="exercise-detail__performance-card">
              <small>Dernière séance</small>

              <strong>
                {formatMetricValue(
                  performanceSummary.latestValue,
                  performanceSummary.metric,
                )}
              </strong>

              <span>
                {formatDate(
                  performanceSummary.latestEntry.date,
                )}
              </span>
            </article>

            <article className="exercise-detail__performance-card">
              <small>{selectedMetric === "volume" ? "Meilleure réalisation" : "Meilleure série"}</small>

              <strong>
                {formatMetricValue(
                  performanceSummary.bestValue,
                  performanceSummary.metric,
                )}
              </strong>

              <span>
                {formatDate(
                  performanceSummary.bestEntry.date,
                )}
              </span>
            </article>

            <article className="exercise-detail__performance-card">
              <small>
                Progression depuis le début
              </small>

              <strong>
                {performanceSummary.progressionPercent ===
                undefined
                  ? "—"
                  : `${
                      performanceSummary
                        .progressionPercent >= 0
                        ? "+"
                        : ""
                    }${Math.round(
                      performanceSummary
                        .progressionPercent,
                    )} %`}
              </strong>

              <span>
                Depuis{" "}
                {formatMetricValue(
                  performanceSummary.firstValue,
                  performanceSummary.metric,
                )}
              </span>
            </article>
          </div>

          {selectedMetric &&
            chartData.length > 0 && (
              <div className="exercise-detail__chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={chartData}
                    margin={{
                      top: 12,
                      right: 12,
                      bottom: 4,
                      left: 0,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={42}
                    />

                    <Tooltip
                      formatter={(value) => [
                        formatMetricValue(
                          Number(value),
                          selectedMetric,
                        ),
                        metricLabels[selectedMetric],
                      ]}
                    />

                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="currentColor"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
        </section>
      )}

      {hasPerformance && selectedMetric && (
        <section className="exercise-detail__section">
          <h2>Historique récent</h2>

          <div className="exercise-detail__alternatives">
            {performanceHistory
              .filter(
                (entry) =>
                  getPerformanceMetricValue(
                    entry,
                    selectedMetric,
                  ) !== undefined,
              )
              .slice(0, 5)
              .map((entry) => {
                const value =
                  getPerformanceMetricValue(
                    entry,
                    selectedMetric,
                  );

                if (value === undefined) {
                  return null;
                }

                return (
                  <div
                    key={entry.workoutId}
                    className="exercise-detail__alternative"
                  >
                    <span>
                      <strong>
                        {formatDate(entry.date)}
                      </strong>

                      <small>
                        {entry.series.length}{" "}
                        {entry.series.length > 1
                          ? "séries"
                          : "série"}
                      </small>
                    </span>

                    <strong>
                      {formatMetricValue(
                        value,
                        selectedMetric,
                      )}
                    </strong>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {alternatives.length > 0 && (
        <section className="exercise-detail__section">
          <h2>Alternatives</h2>

          <div className="exercise-detail__alternatives">
            {alternatives.map((alternative) => (
              <button
                key={alternative.id}
                type="button"
                className="exercise-detail__alternative"
                onClick={() =>
                  navigate(
                    {
                      pathname: `/exercises/${alternative.id}`,
                      search: selectionMode
                        ? searchParams.toString()
                        : "",
                    },
                    /* La fiche de l'alternative revient elle aussi à la liste d'origine. */
                    { state: location.state },
                  )
                }
              >
                <span>
                  <strong>
                    {alternative.name}
                  </strong>
                  <small>
                    {alternative.category === "Musculation" ||
                    alternative.category === "Cardio"
                      ? `${alternative.equipment} · ${alternative.location}`
                      : `${alternative.category} · ${alternative.location}`}
                  </small>
                </span>

                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {hasPedagogy && (
        <section className="exercise-detail__accordions">
          {exercise.technique && (
            <details open>
              <summary>Technique</summary>
              <p>{exercise.technique}</p>
            </details>
          )}

          {exercise.description && (
            <details open>
              <summary>Description</summary>
              <p>{exercise.description}</p>
            </details>
          )}

          {exercise.muscles && exercise.muscles.length > 0 && (
            <details open>
              <summary>Muscles sollicités</summary>
              <ul>
                {exercise.muscles.map((muscle) => (
                  <li key={muscle}>{muscle}</li>
                ))}
              </ul>
            </details>
          )}

          {exercise.advice && (
            <details open>
              <summary>Conseils / À éviter</summary>
              <p>{exercise.advice}</p>
            </details>
          )}
        </section>
      )}
    </section>
  );
}