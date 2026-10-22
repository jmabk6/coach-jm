import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { PerspectiveSession } from "../../domain";
import { paths } from "../../app/paths";
import { todayLocalDate } from "../today/useTodayData";
import { formatResult, formatTargetLines } from "./dayTargetFormat";
import { loadPerspectives } from "./loadPerspectives";
import { forecastText, statusLabel } from "./perspectiveText";
import type { PerspectiveView } from "./perspectiveView";
import "./Perspectives.css";

const SESSIONS: PerspectiveSession[] = ["A", "B", "C"];

/**
 * Objectifs › Perspectives au 31 mars (lot P3, 22/10/2026) : pour chaque
 * exercice de la séance choisie, la dernière performance, l'objectif de la
 * prochaine séance, la prévision au 31 mars et la situation. Des repères
 * adaptables, ni une obligation ni une promesse.
 */
export function PerspectivesScreen() {
  const [params, setParams] = useSearchParams();
  const session = (SESSIONS.includes(params.get("seance") as PerspectiveSession) ? params.get("seance") : "A") as PerspectiveSession;
  const [today] = useState(todayLocalDate);
  const [views, setViews] = useState<PerspectiveView[]>();

  useEffect(() => {
    let cancelled = false;
    void loadPerspectives(today).then((loaded) => {
      if (!cancelled) setViews(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const shown = (views ?? []).filter((view) => view.track.session === session);

  return (
    <section className="perspectives">
      <Link to={paths.goals()} className="perspectives__back">
        ‹ Objectifs
      </Link>
      <h1>Perspectives au 31 mars</h1>
      <p className="perspectives__lead">Où tu en es, ce que tu vises à la prochaine séance, et une prévision qui s’ajuste à tes résultats. Des repères, pas une obligation.</p>

      <div className="perspectives__sessions" role="group" aria-label="Séance">
        {SESSIONS.map((item) => (
          <button key={item} type="button" aria-pressed={item === session} className={item === session ? "is-active" : ""} onClick={() => setParams({ seance: item }, { replace: true })}>
            Muscu {item}
          </button>
        ))}
      </div>

      {views === undefined ? (
        <p className="perspectives__message">Chargement…</p>
      ) : shown.length === 0 ? (
        <p className="perspectives__message">Aucune perspective pour cette séance.</p>
      ) : (
        <ol className="perspectives__list">
          {shown.map((view) => (
            <PerspectiveCard key={view.track.id} view={view} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PerspectiveCard({ view }: { view: PerspectiveView }) {
  const options = { perDumbbell: view.exercise?.equipment === "Haltères", assistance: view.track.engine === "v6" };
  const next = view.v6 ? view.v6.text : view.next && view.next.sets.length > 0 ? formatTargetLines(view.next, options.perDumbbell).join(" · ") : undefined;
  return (
    <li>
      <Link to={paths.perspective(view.track.id)} className="perspective-card">
        <span className="perspective-card__head">
          <strong>{view.exercise?.name ?? view.track.exerciseId}</strong>
          <span className={`perspective-tag perspective-tag--${view.status}`}>{statusLabel(view.status)}</span>
        </span>
        <span className="perspective-card__line">Dernière : {view.last ? formatResult(view.last.sets, options) : "pas encore de séance"}</span>
        {view.track.suspension ? (
          <span className="perspective-card__line">Progression suspendue : {view.track.suspension.reason}</span>
        ) : (
          next && (
            <span className="perspective-card__line perspective-card__next">
              Prochaine : <strong>{next}</strong>
            </span>
          )
        )}
        <span className="perspective-card__line perspective-card__forecast">{forecastText(view, options)}</span>
        <ChevronRight className="perspective-card__chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </li>
  );
}
