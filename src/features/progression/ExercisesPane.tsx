import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info } from "lucide-react";
import type { Exercise, WorkoutSession } from "../../domain";
import type { Period } from "./period";
import { formatMetricValue } from "./progressionFormat";
import { TrendSparkline } from "./TrendSparkline";
import {
  buildExerciseTrends,
  formatTrendPercent,
  formatTrendsHeadline,
  TREND_METRICS,
  trendMetricLabels,
  trendStatusLabels,
  type ExerciseTrend,
  type ExerciseWithoutTrend,
  type TrendMetric,
  type TrendStatus,
} from "./trends";

/**
 * Onglet Exercices (§16, mockup 25) : un écran de tendances, pas une
 * bibliothèque. Tout vient de `buildExerciseTrends` — aucun calcul ici.
 */

export type TrendFilter = "all" | TrendStatus;

const FILTERS: TrendFilter[] = ["all", "down", "stable", "up"];

function formatShortDay(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

function Dots({ count, required }: { count: number; required: number }) {
  return (
    <span className="trend-dots" aria-hidden="true">
      {Array.from({ length: required }, (_, index) => (
        <span key={index} className={index < count ? "trend-dots__dot trend-dots__dot--on" : "trend-dots__dot"} />
      ))}
    </span>
  );
}

function WithoutTrendRow({ item, from }: { item: ExerciseWithoutTrend; from: string }) {
  return (
    <li>
      <Link to={`/exercises/${item.exercise.id}`} state={{ from }} className="trend-row trend-row--muted">
        <span className="trend-row__body">
          <span className="trend-row__name">{item.exercise.name}</span>
          <span className="trend-row__meta">
            {[item.exercise.zone, item.exercise.equipment].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="trend-row__value">
          {item.lastValue !== undefined && item.lastDate ? (
            <>
              <strong>{formatMetricValue(item.metric, item.lastValue)}</strong>
              <small>dernière valeur · le {formatShortDay(item.lastDate)}</small>
            </>
          ) : (
            <small>aucune valeur calculable</small>
          )}
        </span>
        <span className="trend-row__side">
          <Dots count={item.count} required={item.required} />
          <small>
            {plural(item.count, "réalisation")} sur {item.required}
          </small>
        </span>
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </Link>
    </li>
  );
}

function TrendRow({ trend, from }: { trend: ExerciseTrend; from: string }) {
  return (
    <li>
      <Link to={`/exercises/${trend.exercise.id}`} state={{ from }} className="trend-row">
        <span className="trend-row__body">
          <span className="trend-row__name">{trend.exercise.name}</span>
          <span className="trend-row__meta">
            {[trend.exercise.zone, trend.exercise.equipment].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="trend-row__value">
          <strong>{formatMetricValue(trend.metric, trend.lastValue)}</strong>
          <small>dernière · le {formatShortDay(trend.lastDate)}</small>
        </span>
        <span className="trend-row__side">
          <TrendSparkline trend={trend} />
          <span className={`trend-row__percent trend-row__percent--${trend.status}`}>
            {formatTrendPercent(trend.percent)} <small>sur la période</small>
          </span>
          <small>{plural(trend.count, "réalisation")}</small>
        </span>
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </Link>
    </li>
  );
}

export interface ExercisesPaneProps {
  exercises: Exercise[];
  workouts: WorkoutSession[];
  period: Period;
  metric: TrendMetric;
  filter: TrendFilter;
  onMetricChange: (metric: TrendMetric) => void;
  onFilterChange: (filter: TrendFilter) => void;
  /** Adresse de cet écran, pour que la fiche ramène ici. */
  returnTo: string;
}

export function ExercisesPane({
  exercises,
  workouts,
  period,
  metric,
  filter,
  onMetricChange,
  onFilterChange,
  returnTo,
}: ExercisesPaneProps) {
  const report = useMemo(() => buildExerciseTrends(exercises, workouts, period, metric), [exercises, workouts, period, metric]);
  const visible = filter === "all" ? report.eligible : report.eligible.filter((trend) => trend.status === filter);

  return (
    <div className="progression-pane">
      <div role="group" aria-label="Métrique" className="trend-metrics">
        {TREND_METRICS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={metric === item}
            className={`trend-metric ${metric === item ? "trend-metric--active" : ""}`}
            onClick={() => onMetricChange(item)}
          >
            {trendMetricLabels[item]}
          </button>
        ))}
      </div>

      {report.state === "none-compatible" ? (
        <section className="progression-card">
          <h2>{trendMetricLabels[metric]}</h2>
          <p className="progression-empty">Aucun exercice compatible avec cette métrique n'a été réalisé sur la période.</p>
        </section>
      ) : (
        <>
          <p className="trend-headline">
            <strong>{trendMetricLabels[metric]}</strong> · {formatTrendsHeadline(report).split(" · ")[1]}
          </p>

          {report.state === "trends" && (
            <>
              <p className="trend-counts">
                {(["down", "stable", "up"] as const)
                  .map((status) => `${report.counts[status]} ${trendStatusLabels[status].toLowerCase()}${report.counts[status] > 1 && status === "stable" ? "s" : ""}`)
                  .join(" · ")}
              </p>
              <div role="group" aria-label="Filtre de tendance" className="trend-filters">
                {FILTERS.map((item) => {
                  const count = item === "all" ? report.eligible.length : report.counts[item];
                  const label = item === "all" ? "Toutes" : item === "stable" ? "Stables" : trendStatusLabels[item];

                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={filter === item}
                      className={`trend-filter trend-filter--${item} ${filter === item ? "trend-filter--active" : ""}`}
                      onClick={() => onFilterChange(item)}
                    >
                      {label} <span className="trend-filter__count">{count}</span>
                    </button>
                  );
                })}
              </div>

              <ul className="trend-list">
                {visible.map((trend) => (
                  <TrendRow key={trend.exercise.id} trend={trend} from={returnTo} />
                ))}
              </ul>

              {filter === "all" && report.withoutTrend.length > 0 && (
                <details className="trend-without">
                  <summary>
                    {plural(report.withoutTrend.length, "exercice")} sans tendance pour le moment
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                  </summary>
                  <ul className="trend-list">
                    {report.withoutTrend.map((item) => (
                      <WithoutTrendRow key={item.exercise.id} item={item} from={returnTo} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {report.state === "none-eligible" && (
            <>
              <p className="progression-notice">
                <Info size={18} strokeWidth={2} aria-hidden="true" />
                <span>
                  Une tendance s'affiche à partir de 3 réalisations comparables sur la période, pour cet exercice et
                  cette métrique.
                </span>
              </p>
              <section className="progression-card progression-card--flush">
                <h2 className="trend-without__title">
                  {plural(report.withoutTrend.length, "exercice")} sans tendance pour le moment
                </h2>
                <ul className="trend-list">
                  {report.withoutTrend.map((item) => (
                    <WithoutTrendRow key={item.exercise.id} item={item} from={returnTo} />
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
