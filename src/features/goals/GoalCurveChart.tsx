import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp } from "lucide-react";
import type { GoalCurve } from "../../domain/rules/goalRules";

/**
 * Courbe d'un objectif (§ 5.2) : un tracé par segment et par version,
 * jamais reliés ; la trajectoire du segment courant en pointillé ; la
 * semaine de pesée en cours en point creux. Aucune donnée d'entraînement.
 */

const WIDTH = 340;
const HEIGHT = 170;
const PAD = { left: 30, right: 8, top: 10, bottom: 24 };

export function GoalCurveChart({
  curve,
  today,
  dueDate,
  target,
  formatValue,
  emptyText = "Les résultats apparaîtront ici après ton premier test.",
}: {
  curve: GoalCurve;
  today: string;
  dueDate?: string;
  target?: number;
  formatValue: (value: number) => string;
  emptyText?: string;
}) {
  const points = curve.series.flatMap((series) => series.points);
  const all = [...points, ...(curve.trajectory ?? []), ...(curve.provisional ? [curve.provisional] : [])];

  const dates = [today, ...all.map((point) => point.date), ...(dueDate ? [dueDate] : [])].sort();
  const start = startOfMonth(parseISO(dates[0]!));
  const lastDate = parseISO(dates[dates.length - 1]!);
  const end = lastDate > addMonths(start, 5) ? lastDate : addMonths(start, 6);
  const span = Math.max(1, differenceInCalendarDays(end, start));

  const values = [...all.map((point) => point.value), ...(target !== undefined ? [target] : [])];
  const low = values.length > 0 ? Math.min(...values) : 0;
  const high = values.length > 0 ? Math.max(...values) : 1;
  const margin = high === low ? Math.max(1, Math.abs(high) * 0.1) : (high - low) * 0.15;
  const yMin = low - margin;
  const yMax = high + margin;

  const x = (date: string) => PAD.left + (differenceInCalendarDays(parseISO(date), start) / span) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin)) * (HEIGHT - PAD.top - PAD.bottom);

  const months: Date[] = [];
  for (let month = start; month <= end; month = addMonths(month, 1)) months.push(month);

  return (
    <div className="goal-curve">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Courbe de l'objectif">
        {months.map((month) => {
          const date = format(month, "yyyy-MM-dd");
          return (
            <g key={date}>
              <line x1={x(date)} x2={x(date)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="goal-curve__grid" />
              <text x={x(date)} y={HEIGHT - 8} className="goal-curve__tick" textAnchor="middle">
                {format(month, "MMM", { locale: fr })}
              </text>
            </g>
          );
        })}
        {/* Axe des valeurs : seulement quand il y a des points, et une graduation par valeur distincte. */}
        {points.length > 0 &&
          [...new Set([low, high])].map((value, index) => (
            <text key={index} x={PAD.left - 4} y={y(value) + 3} className="goal-curve__tick" textAnchor="end">
              {formatValue(value).replace(/\s.*$/, "")}
            </text>
          ))}
        {curve.trajectory && (
          <line
            x1={x(curve.trajectory[0].date)}
            y1={y(curve.trajectory[0].value)}
            x2={x(curve.trajectory[1].date)}
            y2={y(curve.trajectory[1].value)}
            className="goal-curve__trajectory"
          />
        )}
        {curve.series.map((series) => (
          <g key={`${series.segmentId}-${series.versionId ?? ""}`}>
            <polyline
              points={series.points.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")}
              className="goal-curve__line"
            />
            {series.points.map((point) => (
              <circle key={point.date} cx={x(point.date)} cy={y(point.value)} r={3.5} className="goal-curve__point">
                <title>{`${point.date} : ${formatValue(point.value)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {curve.provisional && (
          <circle cx={x(curve.provisional.date)} cy={y(curve.provisional.value)} r={3.5} className="goal-curve__provisional" />
        )}
      </svg>
      {points.length === 0 && !curve.provisional && (
        <p className="goal-curve__empty">
          <TrendingUp size={18} strokeWidth={2} aria-hidden="true" />
          {emptyText}
        </p>
      )}
    </div>
  );
}
