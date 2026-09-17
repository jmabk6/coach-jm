import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Target } from "lucide-react";
import { CardioPane } from "./CardioPane";
import { ExercisesPane, type TrendFilter } from "./ExercisesPane";
import { OverviewPane } from "./OverviewPane";
import { buildOverview } from "./overview";
import { formatPeriodRange, periodLabels, resolvePeriod, type PeriodKey } from "./period";
import { TREND_METRICS, type TrendMetric } from "./trends";
import { useProgressionData } from "./useProgressionData";
import "./Progression.css";

export type ProgressionTab = "general" | "exercices" | "cardio";

const TABS: Array<{ key: ProgressionTab; label: string }> = [
  { key: "general", label: "Vue générale" },
  { key: "exercices", label: "Exercices" },
  { key: "cardio", label: "Cardio" },
];

const PERIODS: PeriodKey[] = ["4w", "12w", "1y"];

function readPeriod(value: string | null): PeriodKey {
  return PERIODS.includes(value as PeriodKey) ? (value as PeriodKey) : "12w";
}

function readTab(value: string | null): ProgressionTab {
  return TABS.some((tab) => tab.key === value) ? (value as ProgressionTab) : "general";
}

function readMetric(value: string | null): TrendMetric {
  return TREND_METRICS.includes(value as TrendMetric) ? (value as TrendMetric) : "chargeMax";
}

const FILTERS: TrendFilter[] = ["all", "down", "stable", "up"];

function readFilter(value: string | null): TrendFilter {
  return FILTERS.includes(value as TrendFilter) ? (value as TrendFilter) : "all";
}

/**
 * Progression (§16) : trois onglets, un sélecteur de période commun, le
 * bouton `Mes objectifs` (§16 bis, Étape 9). L'onglet et la période
 * vivent dans l'adresse pour qu'un retour depuis un détail retrouve le
 * même écran.
 */
export function ProgressionScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const data = useProgressionData();
  const periodKey = readPeriod(searchParams.get("period"));
  const tab = readTab(searchParams.get("tab"));
  const metric = readMetric(searchParams.get("metric"));
  const filter = readFilter(searchParams.get("filter"));
  const here = `${location.pathname}${location.search}`;

  const update = (patch: { period?: PeriodKey; tab?: ProgressionTab; metric?: TrendMetric; filter?: TrendFilter }) => {
    const next = new URLSearchParams(searchParams);
    const set = (key: string, value: string | undefined, defaultValue: string) => {
      if (value === undefined) return;
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
    };
    set("period", patch.period, "12w");
    set("tab", patch.tab, "general");
    set("metric", patch.metric, "chargeMax");
    set("filter", patch.filter, "all");
    /* Changer de métrique remet le filtre : les compteurs ne sont plus les mêmes. */
    if (patch.metric !== undefined && patch.filter === undefined) next.delete("filter");
    setSearchParams(next, { replace: true });
  };

  const today = data.status === "ready" ? data.today : undefined;
  const period = useMemo(() => (today ? resolvePeriod(periodKey, today) : undefined), [periodKey, today]);
  const overview = useMemo(
    () => (data.status === "ready" && period ? buildOverview(data.sources, period, data.today) : undefined),
    [data, period],
  );

  return (
    <section className="progression">
      <header className="progression__header">
        <div className="progression__title">
          <h1>Progression</h1>
          <label className="progression__period">
            <span className="visually-hidden">Période</span>
            <select value={periodKey} onChange={(event) => update({ period: event.target.value as PeriodKey })}>
              {PERIODS.map((key) => (
                <option key={key} value={key}>
                  {periodLabels[key]}
                </option>
              ))}
            </select>
            {period && <small>{formatPeriodRange(period)}</small>}
          </label>
        </div>
        <div className="progression__toolbar">
          <div role="tablist" aria-label="Onglets de Progression" className="progression__tabs">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                className={`progression__tab ${tab === item.key ? "progression__tab--active" : ""}`}
                onClick={() => update({ tab: item.key })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="progression__goals"
            disabled
            title="Disponible à l'Étape 9 — Objectifs"
            aria-describedby="progression-goals-hint"
          >
            <Target size={16} strokeWidth={2} aria-hidden="true" />
            Mes objectifs
          </button>
          <span id="progression-goals-hint" className="visually-hidden">
            Disponible à l'Étape 9 — Objectifs
          </span>
        </div>
      </header>

      {data.status === "loading" && <p className="progression__message">Chargement de la progression…</p>}
      {data.status === "error" && (
        <p className="progression__message progression__message--error">{data.message}</p>
      )}

      {overview && tab === "general" && <OverviewPane overview={overview} />}
      {data.status === "ready" && period && tab === "exercices" && (
        <ExercisesPane
          exercises={data.sources.exercises}
          workouts={data.sources.workouts}
          period={period}
          metric={metric}
          filter={filter}
          onMetricChange={(value) => update({ metric: value })}
          onFilterChange={(value) => update({ filter: value })}
          returnTo={here}
        />
      )}
      {data.status === "ready" && period && tab === "cardio" && (
        <CardioPane exercises={data.sources.exercises} workouts={data.sources.workouts} period={period} returnTo={here} />
      )}
    </section>
  );
}
