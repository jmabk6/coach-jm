import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { formatShortDate } from "../workout/workoutDisplay";
import { formatSeconds } from "../workout/workoutRecap";
import type { CardioExerciseReport } from "./cardio";
import { formatStepGroupLabel } from "./cardio";
import {
  cardioKindLabels,
  describeBpm,
  describeDurationTrend,
  describeLastLine,
  describeRanges,
  describeStepGroup,
  describeTotals,
  formatKm,
  plural,
} from "./cardioFormat";
import { formatPeriodRange, type Period } from "./period";
import { TrendSparkline } from "./TrendSparkline";
import { formatTrendPercent } from "./trends";

/**
 * Détail d'un exercice cardio (§16) : métriques de la période, dernière
 * réalisation, puis — selon le type — la tendance à durée comparable ou
 * le sous-bloc `Paliers comparables`, seule lecture directionnelle du BPM.
 * Présentation pure : tout vient d'un `CardioExerciseReport`.
 */
export function CardioDetailView({ report, period, backTo }: { report: CardioExerciseReport; period: Period; backTo: string }) {
  const totals = describeTotals(report);
  const ranges = describeRanges(report);
  const bpm = describeBpm(report);
  const trend = report.trend ? describeDurationTrend(report.trend) : undefined;
  const groups = report.comparableSteps ?? [];
  const groupsWithTrend = groups.filter((group) => group.status !== undefined).length;

  return (
    <section className="progression cardio-detail">
      <header className="history__nav">
        <Link to={backTo} className="history__back">‹ Cardio</Link>
        <h1>{report.exercise.name}</h1>
        <Link to={`/exercises/${report.exercise.id}`} state={{ from: backTo }} className="history__back cardio-detail__fiche">
          Fiche ›
        </Link>
      </header>
      <p className="cardio-detail__subtitle">
        {cardioKindLabels[report.kind]} · {formatPeriodRange(period)}
      </p>

      <section className="progression-card">
        <h2>Sur la période</h2>
        <div className={`progression-card__grid ${totals.length === 2 ? "progression-card__grid--two" : ""}`}>
          {totals.map((item) => (
            <div key={item.label + item.value}>
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="progression-card">
        <h2>
          Dernière réalisation
          <span className="progression-card__link">le {formatShortDate(report.last.date)}</span>
        </h2>
        <p className="cardio-detail__last">{describeLastLine(report) || "Aucune mesure enregistrée."}</p>
        {ranges.length > 0 && (
          <dl className="cardio-detail__ranges">
            {ranges.map((range) => (
              <div key={range}>
                <dt>Plage de réglages</dt>
                <dd>{range}</dd>
              </div>
            ))}
          </dl>
        )}
        {bpm && (
          <p className={`cardio-detail__bpm ${bpm.average ? "" : "cardio-card__soft"}`}>{bpm.text}</p>
        )}
        <Link
          to={`/workouts/${report.last.workoutId}?returnTo=${encodeURIComponent(backTo)}`}
          className="progression-card__link cardio-detail__recap"
        >
          Voir le récapitulatif ›
        </Link>
      </section>

      {report.kind === "duration_distance" && (
        <section className="progression-card">
          <h2>Tendance à durée comparable</h2>
          {report.trend && trend ? (
            <>
              <p className="cardio-detail__hint">
                Réalisations dont la durée est à ±10 % de la médiane ({formatSeconds(report.trend.medianDurationSec)}),
                {report.trend.metric === "speed_kmh" ? " vitesse" : " allure"} suivie sur les dates réelles.
              </p>
              <p className={`cardio-card__trend ${trend.status ? `cardio-card__trend--${trend.status}` : ""}`}>{trend.text}</p>
              {report.trend.line && report.trend.status && (
                <TrendSparkline
                  points={report.trend.points}
                  line={report.trend.line}
                  status={report.trend.status}
                  label={trend.text}
                  width={280}
                  height={56}
                />
              )}
            </>
          ) : (
            <p className="progression-empty">Aucune réalisation complète (durée et distance) sur la période.</p>
          )}
        </section>
      )}

      {report.kind === "steps" && (
        <section className="progression-card">
          <h2>
            Paliers comparables
            <span className="progression-card__link">{plural(groups.length, "groupe")}</span>
          </h2>
          <p className="cardio-detail__hint">
            Même vitesse, même pente, durée à ±10 % — sur les réglages réellement exécutés, quel que soit le
            rang du palier. Le BPM se compare seulement ici, à partir de 3 occurrences renseignées.
          </p>
          {groups.length === 0 ? (
            <p className="progression-empty">Aucun palier réalisé sur la période.</p>
          ) : (
            <ul className="cardio-groups">
              {groups.map((group) => {
                const described = describeStepGroup(group);

                return (
                  <li key={`${group.speedKmh}-${group.inclinePercent}-${group.durationSec}`} className="cardio-group">
                    <span className="cardio-group__label">{formatStepGroupLabel(group)}</span>
                    <span className={`cardio-group__meta ${described.status ? `cardio-card__trend--${described.status}` : ""}`}>
                      {described.text}
                    </span>
                    {group.line && group.status && (
                      <TrendSparkline
                        points={group.bpmPoints}
                        line={group.line}
                        status={group.status}
                        label={`BPM ${formatTrendPercent(group.percent ?? 0)}`}
                        width={120}
                        height={28}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {groups.length > 0 && groupsWithTrend === 0 && (
            <p className="progression-notice cardio-detail__notice">
              <Info size={18} strokeWidth={2} aria-hidden="true" />
              <span>
                Aucune tendance de BPM pour le moment : il faut 3 occurrences comparables avec BPM renseigné. Comme
                les paliers s'adaptent en direct, elles peuvent rester rares — c'est une information juste.
              </span>
            </p>
          )}
        </section>
      )}

      {report.kind === "distance" && (
        <section className="progression-card">
          <h2>Distance seule</h2>
          <p className="progression-empty">
            Sans durée, ni vitesse, ni allure, ni tendance : {formatKm(report.totals.distanceKm ?? 0)} au total sur la période.
          </p>
        </section>
      )}
    </section>
  );
}
