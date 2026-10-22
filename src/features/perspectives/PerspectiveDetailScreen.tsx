import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { PACE_CAP, PACE_DECAY, PACE_KNOWN_FROM, PROVISIONAL_BELOW } from "../../domain/rules/progressionRules";
import { todayLocalDate } from "../today/useTodayData";
import { formatPlan, formatResult, formatSetTarget, formatTargetLines } from "./dayTargetFormat";
import { loadPerspectives } from "./loadPerspectives";
import { forecastRange, forecastText, formatWeek, statusLabel } from "./perspectiveText";
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
  const range = forecastRange(view, options);
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
          {range && (
            <>
              <span className="perspective-summary__reason">Fourchette basse : {range.low}</span>
              <span className="perspective-summary__reason">Fourchette haute : {range.high}</span>
            </>
          )}
          {view.forecast && (
            <details className="perspective-summary__hypotheses">
              <summary>Hypothèses de calcul</summary>
              <p>
                Objectif de chaque série, semaine après semaine : les règles de séance appliquées à ta dernière séance réelle (la
                prochaine séance, jamais freinée par le rythme), puis à chaque séance simulée. Point de départ : tes 5 dernières
                séances comparables au plus, sur une droite robuste (une séance isolée ou un RPE mal noté ne la déplace pas seul), et
                un profil d’effort médian où une série n’est jamais plus forte que la précédente. Un objectif n’est jugé réalisable que
                si chaque série, prise seule, fait au moins son minimum au plafond de RPE ; sinon il est repris la semaine suivante.
                Ce n’est qu’une estimation : rien n’est « atteint » avant ta séance. La répétition visée est comptée faite avec le
                nombre précédent ; le +1 entier dès que la capacité de cette série le permet. Rythme : niveau moyen de toutes tes
                séries, médiane de tes 6 dernières semaines
                {view.forecast.paceRaw !== undefined ? ` (${(view.forecast.paceRaw * 100).toFixed(1).replace(".", ",")} % par semaine)` : ""}, retenu à{" "}
                {(view.forecast.paceWeekly * 100).toFixed(1).replace(".", ",")} % au plus (borne {(PACE_CAP * 100).toFixed(1).replace(".", ",")} %), ralenti de {Math.round((1 - PACE_DECAY) * 100)} % chaque
                semaine ; charges dans les crans réels de la machine. Le rythme ne freine jamais la prochaine séance : elle suit tes
                performances réelles. Un point de RPE mal noté décale le niveau d’environ 3 %. C’est une
                hypothèse, pas une promesse : l’objectif de la prochaine séance ne dépend que de ta dernière séance. Un RPE absent est
                compté au plafond pour estimer la tendance seulement : il ne valide jamais un palier ni une hausse.
              </p>
              <p>
                Historique (semaines distinctes avec une séance comparable ; deux séances la même semaine comptent pour une) : moins
                de {PACE_KNOWN_FROM} semaines, rythme inconnu — seul l’objectif de la prochaine séance est donné ; de {PACE_KNOWN_FROM} à{" "}
                {PROVISIONAL_BELOW - 1} semaines, prévision provisoire ; à partir de {PROVISIONAL_BELOW} semaines, historique suffisant selon la règle du
                moteur, sans garantie sur la prévision.
              </p>
            </details>
          )}
        </div>
      </div>

      <h2 className="perspectives__h2">Semaine par semaine</h2>
      <p className="perspectives__legend">
        {view.track.engine === "v6" ? (
          <>
            <strong>Initial</strong> : référence du pari, enregistrée le {formatWeek(view.track.initial.createdAt.slice(0, 10))}.{" "}
          </>
        ) : (
          <>
            <strong>Repère initial</strong> ({formatWeek(view.track.initial.createdAt.slice(0, 10))}) : ta meilleure série prévue, pas un objectif par série ; conservé tel quel.{" "}
            {view.track.detailed && (
              <>
                <strong>Référence détaillée</strong> ({formatWeek(view.track.detailed.createdAt.slice(0, 10))}) : l’objectif de chaque série, jamais réécrit.{" "}
              </>
            )}
          </>
        )}
        <strong>Présenté</strong> : objectif affiché ce jour-là. <strong>Actualisé</strong> : objectif de chaque série, recalculé aujourd’hui.{" "}
        <strong>Réel</strong> : ce que tu as noté.
        {view.track.initial.provisional && view.track.engine !== "v6" ? ` Repères calculés sur moins de ${PROVISIONAL_BELOW} semaines avec séance : provisoires.` : ""}
      </p>
      <ol className="perspective-weeks">
        {view.weeks.map((row) => (
          <WeekItem key={row.week} row={row} options={options} v6={view.track.engine === "v6"} />
        ))}
      </ol>
    </section>
  );
}

function WeekItem({ row, options, v6 }: { row: WeekRow; options: { perDumbbell?: boolean; assistance?: boolean }; v6: boolean }) {
  const perDumbbell = options.perDumbbell ?? false;
  return (
    <li className="perspective-week">
      <span className="perspective-week__head">
        <strong>Semaine du {formatWeek(row.week)}</strong>
        <span className={`perspective-tag perspective-tag--${row.status}`}>{statusLabel(row.status)}</span>
      </span>
      {row.initial && (
        <span className="perspective-week__line">
          {v6 ? "Initial" : "Repère initial (meilleure série)"} : {formatSetTarget(row.initial, options)}
        </span>
      )}
      {row.reference && <span className="perspective-week__line">Référence détaillée : {formatPlan(row.reference.sets, perDumbbell)}</span>}
      {row.presented && <span className="perspective-week__line">Présenté : {formatPlan(row.presented.sets, perDumbbell)}</span>}
      {row.actualized && "toRefine" in row.actualized && <span className="perspective-week__line">Actualisé : prévision à affiner</span>}
      {row.actualized && "sets" in row.actualized && (
        <span className="perspective-week__line perspective-week__planned">
          {row.actualized.next ? "Proposé (prochaine séance)" : "Actualisé"} : {formatPlan(row.actualized.sets, perDumbbell)}
          {row.actualized.repeat ? " — objectif reconduit selon la prévision" : ""}
        </span>
      )}
      {row.ongoing && <span className="perspective-week__line">En cours : {formatResult(row.ongoing, options)}</span>}
      {row.actual && <span className="perspective-week__line perspective-week__actual">Réel : {formatResult(row.actual.sets, options)}</span>}
    </li>
  );
}
