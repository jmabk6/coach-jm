import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, BarChart3, ChevronRight, Dumbbell, Ellipsis, TriangleAlert, Trophy } from "lucide-react";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Exercise, PerformedSeries, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { getActiveExercises, getExercise } from "../../db/repositories/exerciseRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { getStrengthFrameByExercise, getStrengthFrameVersions } from "../../db/repositories/strengthRepository";
import { formatFr } from "../../domain/rules/dateFr";
import { formatClassification } from "../../domain/rules/exerciseRules";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { findLastPerformances } from "../workout/lastPerformance";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  getDefaultPerformanceMetric,
  getPerformanceMetricValue,
  type ExercisePerformanceEntry,
} from "./exercisePerformance";
import {
  bestSeriesOf,
  cardioRowsOf,
  chartSpecOf,
  headerTagsOf,
  nextSessionOf,
  sentencesOf,
  sessionRowsOf,
} from "./exerciseSheet";
import { FrameSection } from "../strength/FrameSection";
import { ExerciseDemonstration } from "./ExerciseDemonstration";
import "./ExerciseDetailScreen.css";

/**
 * Fiche exercice (refonte du 26/09/2026, maquette validée) : en-tête,
 * image réduite, trois onglets — Progression (par défaut), Comment faire,
 * Alternatives — et un menu ⋯ : Modifier l'exercice, Réglages de
 * progression (le cadre complet : version, jalons, archiver).
 */

type LoadState =
  | { status: "loading" }
  | {
      status: "success";
      exercise: Exercise;
      allExercises: Exercise[];
      performanceHistory: ExercisePerformanceEntry[];
      /** Séances terminées : réglages de progression, cardio, dernière séance. */
      completedWorkouts: WorkoutSession[];
      /** Version active du cadre, s'il y en a une. */
      frameVersion: StrengthFrameVersion | undefined;
      /** Séries de la dernière séance de l'exercice, pour la charge conseillée. */
      lastSeries: PerformedSeries[] | undefined;
    }
  | { status: "not-found" }
  | { status: "error"; message: string };

const TABS = [
  { key: "progression", label: "Progression" },
  { key: "comment", label: "Comment faire" },
  { key: "alternatives", label: "Alternatives" },
] as const;

const chartNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Cardio par paliers ou mesure simple (tapis, vélo, rameur…) : durée, vitesse, pente, FC. */
function isCardioByCourse(exercise: Exercise): boolean {
  return exercise.mode === "steps" || (exercise.category === "Cardio" && exercise.measurementType !== "duration_power");
}

export function ExerciseDetailScreen() {
  const navigate = useNavigate();
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const selectionMode = searchParams.get("mode") === "select";

  /* Retour vers la liste telle qu'on l'a quittée (filtres, recherche, tri). */
  const cameFrom = (location.state as { from?: string } | null)?.from;
  const exercisesBackTarget = cameFrom ?? (selectionMode ? `/exercises?${searchParams.toString()}` : "/exercises");
  /* Venue d'ailleurs que la bibliothèque (une séance, un objectif) : « Retour ». */
  const backLabel = cameFrom && !cameFrom.startsWith("/exercises") ? "← Retour" : "← Exercices";

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!exerciseId) {
        setState({ status: "not-found" });
        return;
      }

      try {
        const [exercise, allExercises, workouts, frame] = await Promise.all([
          getExercise(exerciseId),
          getActiveExercises(),
          getCompletedWorkouts(),
          getStrengthFrameByExercise(exerciseId),
        ]);
        const versions = frame ? await getStrengthFrameVersions(frame.id) : [];

        if (cancelled) return;

        if (!exercise || exercise.status !== "active") {
          setState({ status: "not-found" });
          return;
        }

        const active = versions.find((version) => version.id === frame?.activeVersionId && version.status === "active");

        setState({
          status: "success",
          exercise,
          allExercises,
          performanceHistory: buildExercisePerformanceHistory(exercise, workouts),
          completedWorkouts: workouts,
          frameVersion: active,
          lastSeries: findLastPerformances(workouts).get(exercise.id)?.allSeries,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Impossible de charger l'exercice.",
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
    if (state.status !== "success") return [];

    const pinnedIds = new Set(state.exercise.pinnedAlternativeExerciseIds ?? []);

    const pinned = state.allExercises
      .filter((candidate) => candidate.id !== state.exercise.id && pinnedIds.has(candidate.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

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
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return [...pinned, ...automatic];
  }, [state]);

  if (state.status === "loading") {
    return (
      <section className="exercise-detail">
        <p>Chargement de l'exercice...</p>
      </section>
    );
  }

  if (state.status === "error" || state.status === "not-found") {
    return (
      <section className="exercise-detail">
        <button type="button" className="exercise-detail__back" onClick={() => navigate(exercisesBackTarget)}>
          {backLabel}
        </button>
        <h1>{state.status === "error" ? "Erreur" : "Exercice introuvable"}</h1>
        {state.status === "error" && <p>{state.message}</p>}
      </section>
    );
  }

  const { exercise, performanceHistory, completedWorkouts, frameVersion, lastSeries } = state;
  const tab = TABS.find((item) => item.key === searchParams.get("onglet"))?.key ?? "progression";
  const settingsOpen = searchParams.get("vue") === "reglages";

  function setParam(key: string, value: string | undefined) {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (value === undefined) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key === "onglet", state: location.state },
    );
  }

  const header = (
    <>
      <button
        type="button"
        className="exercise-detail__back"
        onClick={() => (settingsOpen ? setParam("vue", undefined) : navigate(exercisesBackTarget))}
      >
        {settingsOpen ? "← Fiche" : backLabel}
      </button>
      <header className="exercise-detail__header">
        <div className="exercise-detail__title-row">
          <h1>{exercise.name}</h1>
          {!settingsOpen && (
            <button type="button" className="exercise-detail__more" aria-label="Autres actions" onClick={() => setMenuOpen(true)}>
              <Ellipsis size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="exercise-detail__tags">
          {headerTagsOf(exercise).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </header>
    </>
  );

  /* ⋯ > Réglages de progression : le cadre complet (version, jalons, archiver). */
  if (settingsOpen) {
    return (
      <section className="exercise-detail">
        {header}
        {formatClassification(exercise) && (
          <p className="exercise-detail__classification">
            Classification de progression : <strong>{formatClassification(exercise)}</strong>
          </p>
        )}
        <FrameSection exercise={exercise} completedWorkouts={completedWorkouts} />
      </section>
    );
  }

  const cardio = isCardioByCourse(exercise);
  const cardioRows = cardio ? cardioRowsOf(exercise, completedWorkouts) : [];
  const next = cardio ? undefined : nextSessionOf(exercise, frameVersion, lastSeries);
  const rows = sessionRowsOf(performanceHistory);
  const metric = getDefaultPerformanceMetric(exercise);
  const summary = metric ? buildExercisePerformanceSummary(performanceHistory, metric, loadSemanticsOf(exercise)) : undefined;
  const chart = metric ? chartSpecOf(exercise, metric) : undefined;
  const chartData = metric
    ? performanceHistory
        .flatMap((entry) => {
          const value = getPerformanceMetricValue(entry, metric);
          return value === undefined ? [] : [{ date: entry.date, label: formatFr(entry.date, "dd/MM"), value }];
        })
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const best = summary ? bestSeriesOf(summary) : undefined;
  const sessionCount = cardio ? cardioRows.length : rows.length;
  const techniquePoints = sentencesOf(exercise.technique);
  const advicePoints = sentencesOf(exercise.advice);

  return (
    <section className="exercise-detail">
      {header}

      <section className="exercise-detail__media">
        <ExerciseDemonstration exercise={exercise} />
      </section>

      <div className="exercise-detail__tabs" role="tablist" aria-label="Rubriques de la fiche">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`exercise-detail__tab${tab === item.key ? " exercise-detail__tab--active" : ""}`}
            onClick={() => setParam("onglet", item.key === "progression" ? undefined : item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "progression" && (
        <div className="exercise-detail__panel">
          {next && (
            <article className="exercise-detail__card">
              <h2>Prochaine séance</h2>
              <div className="exercise-detail__next">
                <span className="exercise-detail__next-icon" aria-hidden="true">
                  <Dumbbell size={22} strokeWidth={2} />
                </span>
                <div>
                  <strong>{next.headline}</strong>
                  {next.details && <p>{next.details}</p>}
                </div>
              </div>
              {next.rule && (
                <p className="exercise-detail__rule">
                  {frameVersion?.progressionType === "assistance_decroissante" ? (
                    <ArrowDown size={18} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
                  )}
                  <span>{next.rule}</span>
                </p>
              )}
            </article>
          )}

          <article className="exercise-detail__card">
            <div className="exercise-detail__card-heading">
              <h2>Dernières séances</h2>
              {sessionCount > 3 && (
                <button
                  type="button"
                  className="exercise-detail__chevron"
                  aria-label="Toutes les séances"
                  onClick={() => setShowAllSessions((value) => !value)}
                >
                  <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
            </div>
            {sessionCount === 0 ? (
              <div className="exercise-detail__empty">
                <BarChart3 size={34} strokeWidth={2} aria-hidden="true" />
                <strong>Pas encore de séance</strong>
                <p>La première séance posera ta référence et affichera ici ta progression.</p>
              </div>
            ) : cardio ? (
              <table className="exercise-detail__sessions exercise-detail__sessions--cardio">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Durée</th>
                    <th scope="col">Vitesse</th>
                    <th scope="col">Pente</th>
                    <th scope="col">FC</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllSessions ? cardioRows : cardioRows.slice(0, 3)).map((row) => (
                    <tr key={row.workoutId}>
                      <td>{row.date}</td>
                      <td>{row.duration}</td>
                      <td>{row.speed}</td>
                      <td>{row.incline}</td>
                      <td>{row.bpm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="exercise-detail__sessions">
                <tbody>
                  {(showAllSessions ? rows : rows.slice(0, 3)).map((row) => (
                    <tr key={row.workoutId}>
                      <td>{row.date}</td>
                      <td className="exercise-detail__sessions-load">{row.load}</td>
                      <td>{row.reps}</td>
                      <td>{row.rpe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sessionCount > 3 && (
              <button type="button" className="exercise-detail__link" onClick={() => setShowAllSessions((value) => !value)}>
                {showAllSessions ? "Voir moins" : "Voir toutes les séances"}
              </button>
            )}
          </article>

          {!cardio && chart && chartData.length > 0 && (
            <article className="exercise-detail__card">
              <div className="exercise-detail__card-heading">
                <h2>{chart.title}</h2>
                <small className="exercise-detail__better">
                  <ArrowUp size={14} strokeWidth={2.4} aria-hidden="true" />
                  {chart.better}
                </small>
              </div>
              <div className="exercise-detail__chart">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData} margin={{ top: 22, right: 18, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    {/* Assistance : axe inversé, la courbe monte quand l'aide baisse. */}
                    <YAxis tickLine={false} axisLine={false} width={34} reversed={chart.reversed} domain={["auto", "auto"]} />
                    <Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}>
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(value: unknown) => `${chartNumber.format(Number(value))}${chart.unit ? ` ${chart.unit}` : ""}`}
                      />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {best && (
                <p className="exercise-detail__best">
                  <Trophy size={20} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <small>Meilleure série</small>
                    <strong>{best.text}</strong>
                  </span>
                  <small>{best.date}</small>
                </p>
              )}
            </article>
          )}
        </div>
      )}

      {tab === "comment" && (
        <div className="exercise-detail__panel">
          {techniquePoints.length > 0 && (
            <article className="exercise-detail__card">
              <h2>Technique</h2>
              <ol className="exercise-detail__steps">
                {techniquePoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ol>
            </article>
          )}
          {advicePoints.length > 0 && (
            <article className="exercise-detail__card exercise-detail__card--warning">
              <h2>
                <TriangleAlert size={18} strokeWidth={2.2} aria-hidden="true" />
                Conseils / À éviter
              </h2>
              <ul>
                {advicePoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          )}
          {exercise.muscles && exercise.muscles.length > 0 && (
            <article className="exercise-detail__card">
              <h2>Muscles sollicités</h2>
              <div className="exercise-detail__chips">
                {exercise.muscles.map((muscle) => (
                  <span key={muscle}>{muscle}</span>
                ))}
              </div>
            </article>
          )}
          {techniquePoints.length === 0 && advicePoints.length === 0 && !exercise.muscles?.length && (
            <p className="exercise-detail__muted">Pas encore de consignes pour cet exercice.</p>
          )}
        </div>
      )}

      {tab === "alternatives" && (
        <div className="exercise-detail__panel">
          {alternatives.length === 0 ? (
            <p className="exercise-detail__muted">Aucune alternative pour cet exercice.</p>
          ) : (
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
                        search: selectionMode ? searchParams.toString() : "",
                      },
                      /* La fiche de l'alternative revient elle aussi à la liste d'origine. */
                      { state: location.state },
                    )
                  }
                >
                  <span>
                    <strong>{alternative.name}</strong>
                    <small>
                      {alternative.category === "Musculation" || alternative.category === "Cardio"
                        ? `${alternative.equipment} · ${alternative.location}`
                        : `${alternative.category} · ${alternative.location}`}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {menuOpen && (
        <BottomSheet
          title={exercise.name}
          onDismiss={() => setMenuOpen(false)}
          actions={[
            { label: "Modifier l'exercice", onSelect: () => navigate(`/exercises/${exercise.id}/edit`) },
            {
              label: "Réglages de progression",
              onSelect: () => {
                setMenuOpen(false);
                setParam("vue", "reglages");
              },
            },
          ]}
        />
      )}
    </section>
  );
}
