import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  COMPOSITION_SPECS,
  formatComposition,
  formatMonthLong,
  formatMonthShort,
  formatReadingCount,
  MIN_READINGS_PER_MONTH,
  type CompositionSummary,
  type CompositionTrend,
} from "../../domain/rules/bodyCompositionRules";

/**
 * Objectif Poids : masse grasse et masse musculaire (26/09/2026). Des
 * estimations de la balance : moyenne du mois dès 4 relevés, petite courbe
 * mois par mois, flèche de tendance. Le poids reste l'indicateur
 * principal ; rien ici n'entre dans le statut.
 */

const TRENDS: Record<CompositionTrend, { label: string; Icon: typeof ArrowUpRight }> = {
  up: { label: "en hausse", Icon: ArrowUpRight },
  down: { label: "en baisse", Icon: ArrowDownRight },
  stable: { label: "stable", Icon: ArrowRight },
};

/** Au plus les 12 derniers mois valides. */
const CURVE_MONTHS = 12;

export function BodyCompositionSection({ summaries }: { summaries: CompositionSummary[] }) {
  return (
    <section className="goal-section">
      {/* Phase 2.1 : les relevés Withings historiques, à part de la cible (RENPHO). */}
      <h2>Composition Withings</h2>
      <p className="goal-section__lead">
        Relevés de la balance Withings, notés avec la pesée. Moyenne du mois à partir de {MIN_READINGS_PER_MONTH} relevés ; le poids reste l'indicateur principal.
      </p>
      <ul className="goal-secondary">
        {summaries.map((summary) => (
          <CompositionCard key={summary.key} summary={summary} />
        ))}
      </ul>
    </section>
  );
}

function CompositionCard({ summary }: { summary: CompositionSummary }) {
  const { key, current, lastValid, trend } = summary;
  const spec = COMPOSITION_SPECS[key];
  const valid = summary.months.filter((month) => month.valid).slice(-CURVE_MONTHS);

  return (
    <li className="goal-secondary__card composition-card" data-composition={key}>
      <span className="goal-secondary__label">{spec.label}</span>
      {current.valid ? (
        <>
          <strong>{formatComposition(key, current.mean!)}</strong>
          <span className="goal-secondary__caption">
            Moyenne de {formatMonthLong(current.month)} · {formatReadingCount(current.count)}
          </span>
        </>
      ) : (
        <>
          <strong className="composition-card__missing">Pas assez de relevés</strong>
          <span className="goal-secondary__caption">
            {formatMonthLong(current.month)} : {current.count} sur {MIN_READINGS_PER_MONTH} minimum
          </span>
          {lastValid && (
            <span className="goal-secondary__caption">
              {capitalize(formatMonthLong(lastValid.month))} : {formatComposition(key, lastValid.mean!)}
            </span>
          )}
        </>
      )}
      {trend && valid.length >= 2 && <TrendLine trend={trend} since={valid[valid.length - 2]!.month} />}
      {valid.length > 0 && <MonthCurve months={valid} format={(value) => formatComposition(key, value)} label={spec.label} />}
      <span className="composition-card__source">Estimation de la balance</span>
    </li>
  );
}

/** Dernier mois valide comparé au mois valide qui le précède. */
function TrendLine({ trend, since }: { trend: CompositionTrend; since: string }) {
  const { label, Icon } = TRENDS[trend];
  return (
    <span className="composition-card__trend" data-trend={trend}>
      <Icon size={14} strokeWidth={2.4} aria-hidden="true" /> {label} par rapport à {formatMonthLong(since).split(" ")[0]}
    </span>
  );
}

const W = 140;
const H = 44;
const PAD_X = 6;
const PAD_Y = 6;

/** Une moyenne par mois valide, reliées ; premier et dernier mois nommés. */
function MonthCurve({ months, format, label }: { months: CompositionSummary["months"]; format: (value: number) => string; label: string }) {
  const values = months.map((month) => month.mean!);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = (index: number) => (months.length === 1 ? W / 2 : PAD_X + (index / (months.length - 1)) * (W - 2 * PAD_X));
  const y = (value: number) => (high === low ? H / 2 : PAD_Y + (1 - (value - low) / (high - low)) * (H - 2 * PAD_Y));
  const first = months[0]!;
  const last = months[months.length - 1]!;

  return (
    <figure className="composition-card__curve">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}, moyennes mensuelles : ${months.map((month) => `${formatMonthShort(month.month)} ${format(month.mean!)}`).join(", ")}`}
      >
        {months.length > 1 && <polyline points={months.map((month, index) => `${x(index)},${y(month.mean!)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />}
        {months.map((month, index) => (
          <circle key={month.month} cx={x(index)} cy={y(month.mean!)} r={3} fill="currentColor" />
        ))}
      </svg>
      <figcaption className={months.length === 1 ? "composition-card__curve-single" : undefined}>
        <span>{formatMonthShort(first.month)}</span>
        {months.length > 1 && <span>{formatMonthShort(last.month)}</span>}
      </figcaption>
    </figure>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
