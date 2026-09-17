import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ExerciseTrend } from "./trends";

/**
 * Mini-graphique d'une tendance (§16) : **un point par réalisation
 * comparable**, placé sur l'axe du temps à sa date réelle — jamais des
 * espacements réguliers, jamais des barres hebdomadaires — et la droite
 * de régression entre la première et la dernière réalisation.
 */
export function TrendSparkline({ trend, width = 96, height = 32 }: { trend: ExerciseTrend; width?: number; height?: number }) {
  const points = trend.points;
  const first = parseISO(points[0]!.date);
  const spanDays = Math.max(1, differenceInCalendarDays(parseISO(points[points.length - 1]!.date), first));
  const values = [...points.map((point) => point.value), trend.line.fittedFirst, trend.line.fittedLast];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const x = (date: string) => pad + (differenceInCalendarDays(parseISO(date), first) / spanDays) * innerWidth;
  const y = (value: number) => (max === min ? pad + innerHeight / 2 : pad + innerHeight - ((value - min) / (max - min)) * innerHeight);

  return (
    <svg
      className={`trend-sparkline trend-sparkline--${trend.status}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${trend.count} réalisations, tendance ${trend.percent > 0 ? "+" : ""}${trend.percent} %`}
    >
      <line
        x1={x(points[0]!.date)}
        y1={y(trend.line.fittedFirst)}
        x2={x(points[points.length - 1]!.date)}
        y2={y(trend.line.fittedLast)}
        className="trend-sparkline__line"
      />
      {points.map((point) => (
        <circle key={`${point.workoutId}-${point.date}`} cx={x(point.date)} cy={y(point.value)} r={2.2} className="trend-sparkline__dot" />
      ))}
    </svg>
  );
}
