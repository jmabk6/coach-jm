import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { buildCardioExerciseReport } from "./cardio";
import { CardioDetailView } from "./CardioDetailView";
import { PERIOD_DAYS, resolvePeriod, type PeriodKey } from "./period";
import { useProgressionData } from "./useProgressionData";
import "./Progression.css";
import { paths } from "../../app/paths";

/**
 * `/progression/cardio/:exerciseId` : le détail d'un exercice cardio,
 * sur la période portée par l'adresse ; le retour ramène à l'onglet
 * Cardio tel qu'on l'a quitté.
 */
export function CardioDetailScreen() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const [searchParams] = useSearchParams();
  const data = useProgressionData();

  const periodParam = searchParams.get("period");
  const periodKey: PeriodKey = periodParam && periodParam in PERIOD_DAYS ? (periodParam as PeriodKey) : "12w";
  const backTo =
    searchParams.get("returnTo") ?? paths.progression({ tab: "cardio", period: periodKey === "12w" ? undefined : periodKey });

  const period = useMemo(
    () => (data.status === "ready" ? resolvePeriod(periodKey, data.today) : undefined),
    [data, periodKey],
  );
  const report = useMemo(() => {
    if (data.status !== "ready" || !period || !exerciseId) return undefined;
    const exercise = data.sources.exercises.find((item) => item.id === exerciseId);
    return exercise ? buildCardioExerciseReport(exercise, data.sources.workouts, period) : undefined;
  }, [data, period, exerciseId]);

  if (data.status === "loading") {
    return (
      <section className="progression">
        <p className="progression__message">Chargement…</p>
      </section>
    );
  }

  if (data.status === "error") {
    return (
      <section className="progression">
        <p className="progression__message progression__message--error">{data.message}</p>
      </section>
    );
  }

  if (!report || !period) {
    return (
      <section className="progression">
        <header className="history__nav">
          <Link to={backTo} className="history__back">‹ Cardio</Link>
          <h1>Cardio</h1>
        </header>
        <p className="progression__message">Aucune réalisation de cet exercice sur la période.</p>
      </section>
    );
  }

  return <CardioDetailView report={report} period={period} backTo={backTo} />;
}
