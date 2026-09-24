import { Link } from "react-router-dom";
import { BarChart3, CalendarCheck, Clock, Dumbbell, HeartPulse, PieChart } from "lucide-react";
import type { MuscleZone } from "../../domain";
import { formatDayLabel } from "../../domain/rules/programRules";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import type { Breakdown, CategoryKey, Overview } from "./overview";
import { periodBaseLabels, periodLabels } from "./period";
import { formatTrendPercent } from "./trends";
import { formatDurationTotal } from "./progressionFormat";
import { paths } from "../../app/paths";

/**
 * Vue générale (§16, mockup 24) : six blocs, dans cet ordre, et rien
 * d'autre. Tous les chiffres viennent des agrégats de `overview.ts` ; les
 * cartes sont neutres — ni couleur, ni flèche — et une variation n'existe
 * que si la période précédente est couverte. Ni RPE ni BPM ici.
 */

const kg = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Variation({ percent, base }: { percent: number | undefined; base: string }) {
  if (percent === undefined) return null;

  return (
    <span className="progression-card__variation">
      {formatTrendPercent(percent)} <small>{base}</small>
    </span>
  );
}

/* « Bilan de mobilité » n'est jamais une ligne de la répartition (les bilans
   sont hors statistiques, § 11.4) ; la clé existe parce que le type est
   exhaustif. */
const categoryLabels: Record<CategoryKey, string> = {
  Musculation: "Musculation",
  Cardio: "Cardio",
  Mobilité: "Mobilité",
  "Bilan de mobilité": "Bilan de mobilité",
  Routine: "Routine",
  "Sans catégorie": "Sans catégorie",
};

function Bars<K extends string>({
  breakdown,
  labelOf,
  totalLabel,
  emptyLabel,
}: {
  breakdown: Breakdown<K>;
  labelOf: (key: K) => string;
  totalLabel: string;
  emptyLabel: string;
}) {
  if (breakdown.total === 0) {
    return <p className="progression-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="progression-bars">
      {breakdown.lines.map((line) => (
        <li key={line.key}>
          <span className="progression-bars__label">{labelOf(line.key)}</span>
          <span className="progression-bars__track" aria-hidden="true">
            <span className="progression-bars__fill" style={{ width: `${line.percent}%` }} />
          </span>
          <span className="progression-bars__count">{line.count}</span>
          <span className="progression-bars__percent">{line.percent} %</span>
        </li>
      ))}
      <li className="progression-bars__total">
        <span className="progression-bars__label progression-bars__label--wide">
          Total <small>{totalLabel}</small>
        </span>
        <span className="progression-bars__count">{breakdown.total}</span>
        <span className="progression-bars__percent">100 %</span>
      </li>
    </ul>
  );
}

export function OverviewPane({ overview }: { overview: Overview }) {
  const { period, completion, frequency, strength, cardio, categories, zones, recent } = overview;
  const base = periodBaseLabels[period.key];
  const shortPeriod = period.days < 14;

  return (
    <div className="progression-pane">
      {/* 1. Taux de réalisation du programme */}
      <section className="progression-card">
        <h2>
          <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
          Taux de réalisation du programme
        </h2>
        {completion.percent === undefined ? (
          <p className="progression-empty">Aucune séance planifiée attendue sur la période.</p>
        ) : (
          <>
            <div className="progression-card__row">
              <strong className="progression-card__big">{completion.percent} %</strong>
              <span className="progression-card__meta">
                <strong>
                  {completion.done} / {completion.expected}
                </strong>
                <small>séances planifiées réalisées</small>
              </span>
            </div>
            <div className="progression-gauge" role="img" aria-label={`${completion.percent} % réalisé`}>
              <span style={{ width: `${completion.percent}%` }} />
            </div>
          </>
        )}
      </section>

      {/* 2. Fréquence d'entraînement */}
      <section className="progression-card">
        <h2>
          <Clock size={18} strokeWidth={2} aria-hidden="true" />
          Fréquence d'entraînement
        </h2>
        {frequency.sessions === 0 ? (
          <p className="progression-empty">Aucune séance réalisée sur la période.</p>
        ) : (
          <div className="progression-card__row">
            {!shortPeriod && frequency.perWeek !== undefined ? (
              <strong className="progression-card__big">
                {one.format(frequency.perWeek)} <small>séances / semaine</small>
              </strong>
            ) : (
              <strong className="progression-card__big">
                {frequency.sessions} <small>séance{frequency.sessions > 1 ? "s" : ""}</small>
              </strong>
            )}
            <span className="progression-card__meta">
              <strong>{frequency.sessions}</strong>
              <small>séance{frequency.sessions > 1 ? "s" : ""} réalisée{frequency.sessions > 1 ? "s" : ""}</small>
            </span>
          </div>
        )}
      </section>

      {/* 3. Renforcement */}
      <section className="progression-card">
        <h2>
          <Dumbbell size={18} strokeWidth={2} aria-hidden="true" />
          Renforcement
        </h2>
        <div className="progression-card__grid">
          <div>
            <strong>{kg.format(strength.volumeKg)} kg</strong>
            <small>volume total</small>
            <Variation percent={strength.variation.volume} base={base} />
          </div>
          <div>
            <strong>{strength.seriesDone}</strong>
            <small>séries réalisées</small>
            <Variation percent={strength.variation.series} base={base} />
          </div>
          <div>
            <strong>{strength.sessions}</strong>
            <small>séances contenant du renforcement</small>
            <Variation percent={strength.variation.sessions} base={base} />
          </div>
        </div>
      </section>

      {/* 4. Cardio */}
      <section className="progression-card">
        <h2>
          <HeartPulse size={18} strokeWidth={2} aria-hidden="true" />
          Cardio
        </h2>
        <div className="progression-card__grid progression-card__grid--two">
          <div>
            <strong>{formatDurationTotal(cardio.durationSec)}</strong>
            <small>durée totale</small>
            <Variation percent={cardio.variation.duration} base={base} />
          </div>
          <div>
            <strong>{cardio.sessions}</strong>
            <small>séances contenant du cardio</small>
            <Variation percent={cardio.variation.sessions} base={base} />
          </div>
        </div>
      </section>

      {/* 5. Répartitions */}
      <section className="progression-card">
        <h2>
          <PieChart size={18} strokeWidth={2} aria-hidden="true" />
          Répartitions
        </h2>
        <h3>Par catégorie de séance</h3>
        <Bars
          breakdown={categories}
          labelOf={(key) => categoryLabels[key]}
          totalLabel="(planifiées + libres)"
          emptyLabel="Aucune séance sur la période."
        />
        <h3>Séries réalisées par zone musculaire</h3>
        <Bars
          breakdown={zones}
          labelOf={(key: MuscleZone | "Sans zone") => key}
          totalLabel="séries"
          emptyLabel="Aucune série réalisée sur la période."
        />
      </section>

      {/* 6. Dernières séances réalisées */}
      <section className="progression-card">
        <h2>
          <BarChart3 size={18} strokeWidth={2} aria-hidden="true" />
          Dernières séances réalisées
          <Link to={paths.history()} className="progression-card__link">
            Voir tout ›
          </Link>
        </h2>
        {recent.length === 0 ? (
          <p className="progression-empty">Aucune séance réalisée sur la période.</p>
        ) : (
          <ul className="progression-recent">
            {recent.map((line) => {
              const label = formatDayLabel(line.date);

              return (
                <li key={line.workoutId}>
                  <Link to={`/workouts/${line.workoutId}?returnTo=${encodeURIComponent(paths.progression())}`}>
                    <span className="progression-recent__date">
                      {label.weekday} {label.day}
                    </span>
                    <span className={`progression-recent__icon ${categoryClassName("session-card__icon", line.category ?? "Musculation")}`}>
                      <SessionCategoryIcon category={line.category ?? "Musculation"} size={16} />
                    </span>
                    <span className="progression-recent__name">{line.name}</span>
                    <span className="progression-recent__summary">{line.summary}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="progression-footnote">
        Période : {periodLabels[period.key].toLowerCase()}, glissante en jours. Les variations comparent à la
        période précédente de même durée et n'apparaissent que si l'historique la couvre entièrement.
      </p>
    </div>
  );
}
