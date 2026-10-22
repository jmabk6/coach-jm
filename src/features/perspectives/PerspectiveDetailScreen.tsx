import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { PACE_CAP, PACE_DECAY, PROVISIONAL_BELOW } from "../../domain/rules/progressionRules";
import { todayLocalDate } from "../today/useTodayData";
import { formatResult, formatSetTarget, formatTargetLines } from "./dayTargetFormat";
import { loadPerspectives } from "./loadPerspectives";
import { forecastText, formatWeek, statusLabel } from "./perspectiveText";
import type { PerspectiveView, WeekRow } from "./perspectiveView";
import "./Perspectives.css";

/**
 * Perspective d'un exercice (lot P3, 22/10/2026) : niveau actuel, prochaine
 * séance, prévision au 31 mars, puis le détail semaine par semaine —
 * trajectoire initiale, objectif présenté ou actualisé, résultat réel,
 * situation. Depuis la séance (`?retour=seance`), le retour y ramène : la
 * saisie et le chrono sont enregistrés, rien n'est perdu.
 */
export function PerspectiveDetailScreen() {
  const { trackId = "" } = useParams<{ trackId: string }>();
  const [params] = useSearchParams();
  const fromWorkout = params.get("retour") === "seance";
  const [today] = useState(todayLocalDate);
  const [view, setView] = useState<PerspectiveView | null>();

  useEffect(() => {
    let cancelled = false;
    void loadPerspectives(today).then((views) => {
      if (!cancelled) setView(views.find((item) => item.track.id === trackId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [today, trackId]);

  const back = fromWorkout ? (
    <Link to={paths.workoutLive()} className="perspectives__back">
      ‹ Retour à la séance
    </Link>
  ) : (
    <Link to={paths.perspectives(view ? { seance: view.track.session } : undefined)} className="perspectives__back">
      ‹ Perspectives
    </Link>
  );

  if (view === undefined) return <section className="perspectives">{back}<p className="perspectives__message">Chargement…</p></section>;
  if (view === null) return <section className="perspectives">{back}<p className="perspectives__message">Perspective introuvable.</p></section>;

  const options = { perDumbbell: view.exercise?.equipment === "Haltères", assistance: view.track.engine === "v6" };
  const nextLines = view.v6 ? [view.v6.text] : view.next ? formatTargetLines(view.next, options.perDumbbell) : [];

  return (
    <section className="perspectives">
      {back}
      <h1>{view.exercise?.name ?? view.track.exerciseId}</h1>
      <p className="perspectives__lead">
        Muscu {view.track.session} · <span className={`perspective-tag perspective-tag--${view.status}`}>{statusLabel(view.status)}</span>
      </p>

      <div className="perspective-summary">
        <div>
          <span className="perspective-summary__label">Niveau actuel</span>
          <span>{view.last ? `${formatResult(view.last.sets, options)} (${formatWeek(view.last.date)})` : "Pas encore de séance comparable."}</span>
        </div>
        <div>
          <span className="perspective-summary__label">Prochaine séance</span>
          {view.track.suspension ? (
            <span>Progression suspendue ({view.track.suspension.reason}) : aucune charge recommandée.</span>
          ) : (
            <>
              {nextLines.map((line) => (
                <strong key={line}>{line}</strong>
              ))}
              {view.next && <span className="perspective-summary__reason">{view.next.reason}</span>}
            </>
          )}
        </div>
        <div>
          <span className="perspective-summary__label">Prévision au 31 mars</span>
          <span>{forecastText(view, options)}</span>
          {view.forecast && (
            <details className="perspective-summary__hypotheses">
              <summary>Hypothèses de calcul</summary>
              <p>
                Niveau estimé à partir de la charge, des répétitions et du RPE ; rythme médian de tes 6 dernières semaines
                {view.forecast.paceRaw !== undefined ? ` (${(view.forecast.paceRaw * 100).toFixed(1).replace(".", ",")} % par semaine)` : ""}, retenu à{" "}
                {(view.forecast.paceWeekly * 100).toFixed(1).replace(".", ",")} % au plus (borne {(PACE_CAP * 100).toFixed(1).replace(".", ",")} %), ralenti de {Math.round((1 - PACE_DECAY) * 100)} % chaque
                semaine ; traduit dans les crans réels de la machine. Un point de RPE mal noté décale le niveau d’environ 3 %. C’est une
                hypothèse, pas une promesse : l’objectif de la prochaine séance ne dépend que de ta dernière séance. La prévision
                reste provisoire tant que moins de {PROVISIONAL_BELOW} semaines comptent une séance de cet exercice (deux séances la même
                semaine comptent pour une).
              </p>
            </details>
          )}
        </div>
      </div>

      <h2 className="perspectives__h2">Semaine par semaine</h2>
      <p className="perspectives__legend">
        <strong>Initial</strong> : trajectoire enregistrée le {formatWeek(view.track.initial.createdAt.slice(0, 10))}, jamais réécrite.{" "}
        <strong>Présenté</strong> : objectif affiché ce jour-là. <strong>Actualisé</strong> : recalculé aujourd’hui.{" "}
        <strong>Réel</strong> : ce que tu as noté.
        {view.track.initial.provisional && view.track.engine !== "v6" ? ` Trajectoire initiale provisoire (moins de ${PROVISIONAL_BELOW} semaines avec séance au départ).` : ""}
      </p>
      <ol className="perspective-weeks">
        {view.weeks.map((row) => (
          <WeekItem key={row.week} row={row} options={options} />
        ))}
      </ol>
    </section>
  );
}

function WeekItem({ row, options }: { row: WeekRow; options: { perDumbbell?: boolean; assistance?: boolean } }) {
  const actualized = row.actualized?.next && row.actualized.next.sets.length > 0 ? formatTargetLines(row.actualized.next, options.perDumbbell ?? false).join(" · ") : row.actualized?.forecast ? formatSetTarget(row.actualized.forecast, options) : undefined;
  return (
    <li className="perspective-week">
      <span className="perspective-week__head">
        <strong>Semaine du {formatWeek(row.week)}</strong>
        <span className={`perspective-tag perspective-tag--${row.status}`}>{statusLabel(row.status)}</span>
      </span>
      <span className="perspective-week__line">Initial : {formatSetTarget(row.initial, options)}</span>
      {row.presented && <span className="perspective-week__line">Présenté : {formatTargetLines(row.presented, options.perDumbbell ?? false).join(" · ") || "—"}</span>}
      {actualized && <span className="perspective-week__line">Actualisé : {actualized}</span>}
      {row.actual && <span className="perspective-week__line perspective-week__actual">Réel : {formatResult(row.actual.sets, options)}</span>}
    </li>
  );
}
