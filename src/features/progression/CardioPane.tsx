import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info } from "lucide-react";
import type { Exercise, WorkoutSession } from "../../domain";
import { formatShortDate } from "../workout/workoutDisplay";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { buildCardioReport, type CardioExerciseReport } from "./cardio";
import {
  cardioKindLabels,
  describeBpm,
  describeDurationTrend,
  describeLastLine,
  describeRanges,
  describeTotals,
  plural,
} from "./cardioFormat";
import type { Period } from "./period";

/**
 * Onglet Cardio (§16, mockup 26) : analyse descriptive par exercice, une
 * tendance seulement quand le moteur en fournit une. Tout vient de
 * `buildCardioReport` ; aucune moyenne entre activités, aucun total commun.
 */

function CardioCard({ report, period, returnTo }: { report: CardioExerciseReport; period: Period; returnTo: string }) {
  const totals = describeTotals(report);
  const ranges = describeRanges(report);
  const bpm = describeBpm(report);
  const trend = report.trend ? describeDurationTrend(report.trend) : undefined;
  const to = `/progression/cardio/${report.exercise.id}?period=${period.key}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <li>
      <Link to={to} className="cardio-card">
        <span className="cardio-card__head">
          <span className="progression-recent__icon session-card__icon--Cardio">
            <SessionCategoryIcon category="Cardio" size={16} />
          </span>
          <span className="cardio-card__title">
            <strong>{report.exercise.name}</strong>
            <small>{cardioKindLabels[report.kind]}</small>
          </span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </span>

        <span className="cardio-card__grid">
          {totals.map((item) => (
            <span key={item.label + item.value} className="cardio-card__cell">
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </span>
          ))}
          <span className="cardio-card__cell cardio-card__cell--last">
            <small>Dernière réalisation · le {formatShortDate(report.last.date)}</small>
            <strong>{describeLastLine(report) || "aucune mesure enregistrée"}</strong>
          </span>
        </span>

        {(ranges.length > 0 || bpm) && (
          <span className="cardio-card__ranges">
            {ranges.map((range) => (
              <span key={range}>
                <strong>{range}</strong>
                <small>plage de réglages</small>
              </span>
            ))}
            {bpm && (
              <span>
                <strong className={bpm.average ? undefined : "cardio-card__soft"}>{bpm.text}</strong>
                <small>{bpm.average ? "BPM moyen" : "BPM"}</small>
              </span>
            )}
          </span>
        )}

        {trend && (
          <span className={`cardio-card__trend ${trend.status ? `cardio-card__trend--${trend.status}` : ""}`}>
            {trend.text}
          </span>
        )}
      </Link>
    </li>
  );
}

export function CardioPane({
  exercises,
  workouts,
  period,
  returnTo,
}: {
  exercises: Exercise[];
  workouts: WorkoutSession[];
  period: Period;
  returnTo: string;
}) {
  const report = useMemo(() => buildCardioReport(exercises, workouts, period), [exercises, workouts, period]);

  if (report.state === "empty") {
    return (
      <div className="progression-pane">
        <section className="progression-card">
          <h2>Cardio</h2>
          <p className="progression-empty">Aucun exercice cardio réalisé sur la période.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="progression-pane">
      {!report.hasComparison && (
        <p className="progression-notice">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            Le BPM est analysé uniquement sur des paliers comparables : même exercice, même vitesse, même pente
            et durée comparable. Une comparaison nécessite au moins 3 réalisations de durée comparable, ou
            3 paliers comparables avec BPM renseigné sur la période.
          </span>
        </p>
      )}

      <section className="progression-card progression-card--flush">
        <h2 className="trend-without__title">{plural(report.exercises.length, "exercice cardio", "exercices cardio")}</h2>
        <ul className="cardio-list">
          {report.exercises.map((item) => (
            <CardioCard key={item.exercise.id} report={item} period={period} returnTo={returnTo} />
          ))}
        </ul>
      </section>
    </div>
  );
}
