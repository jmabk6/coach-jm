import { differenceInCalendarDays, parseISO } from "date-fns";
import type { TrendLine, TrendPoint, TrendStatus } from "./trends";

export interface TrendSparklineProps {
  /** Une entrée par réalisation comparable, à sa date réelle. */
  points: TrendPoint[];
  line: TrendLine;
  status: TrendStatus;
  label: string;
  width?: number;
  height?: number;
}

/**
 * Mini-graphique d'une tendance (§16) : **un point par réalisation
 * comparable**, placé sur l'axe du temps à sa date réelle — jamais des
 * espacements réguliers, jamais des barres hebdomadaires — et la droite
 * de régression entre la première et la dernière réalisation.
 */
export function TrendSparkline({ points, line, status, label, width = 96, height = 32 }: TrendSparklineProps) {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = parseISO(ordered[0]!.date);
  const spanDays = Math.max(1, differenceInCalendarDays(parseISO(ordered[ordered.length - 1]!.date), first));
  const values = [...ordered.map((point) => point.value), line.fittedFirst, line.fittedLast];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const x = (date: string) => pad + (differenceInCalendarDays(parseISO(date), first) / spanDays) * innerWidth;
  const y = (value: number) =>
    max === min ? pad + innerHeight / 2 : pad + innerHeight - ((value - min) / (max - min)) * innerHeight;

  return (
    <svg
      className={`trend-sparkline trend-sparkline--${status}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <line
        x1={x(ordered[0]!.date)}
        y1={y(line.fittedFirst)}
        x2={x(ordered[ordered.length - 1]!.date)}
        y2={y(line.fittedLast)}
        className="trend-sparkline__line"
      />
      {ordered.map((point, index) => (
        <circle key={`${point.workoutId}-${index}`} cx={x(point.date)} cy={y(point.value)} r={2.2} className="trend-sparkline__dot" />
      ))}
    </svg>
  );
}

