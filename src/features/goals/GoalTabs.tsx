import { AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Info, Ruler, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import type { Goal } from "../../domain";
import { GOAL_ADVICE } from "./goalAdvice";
import { loadGoalExercises, type GoalExerciseRow } from "./goalExercises";

/**
 * M6 — Objectif > Exercices (lot H.5) : exercices liés, lettre des modèles
 * V1 qui les contiennent, prescription ; hors programme, pas de lettre ;
 * supprimé, ligne inactive ; Tronc et Souplesse, à définir.
 */
export function GoalExercisesTab({ goal }: { goal: Goal }) {
  const [rows, setRows] = useState<GoalExerciseRow[]>();

  useEffect(() => {
    let cancelled = false;
    void loadGoalExercises(goal).then((loaded) => {
      if (!cancelled) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [goal]);

  if (goal.key === "core" || goal.key === "flexibility") {
    return <p className="goal-detail__message">Exercices à définir avec les routines du soir.</p>;
  }
  if (goal.linkedExercises.length === 0) {
    return <p className="goal-detail__message">Aucun exercice lié : le poids se suit par la pesée du matin.</p>;
  }
  if (!rows) return <p className="goal-detail__message">Chargement…</p>;

  const returnTo = paths.goal(goal.key, { onglet: "exercices" });

  return (
    <section className="goal-section">
      <h2>Exercices pour progresser</h2>
      <p className="goal-section__lead">
        Les exercices liés à cet objectif ; la lettre dit dans quelle séance du programme V1 tu les fais.
      </p>
      <ul className="goal-exercises">
        {rows.map((row) => {
          const media = row.exercise?.media?.thumbnailUrl ?? row.exercise?.media?.photoUrl;
          const content = (
            <>
              <span className="goal-exercises__media" aria-hidden="true">
                {media ? <img src={media} alt="" /> : <span className="goal-exercises__placeholder" />}
              </span>
              <span className="goal-exercises__body">
                <strong>{row.exercise?.name ?? "Exercice supprimé"}</strong>
                {row.exercise?.description && <span className="goal-exercises__description">{row.exercise.description}</span>}
                {row.prescription && <span className="goal-exercises__prescription">{row.prescription}</span>}
                {row.inactive && <span className="goal-exercises__inactive">Exercice supprimé</span>}
              </span>
              <span className="goal-exercises__letters">
                {row.templates.map((template) => (
                  <span
                    key={template.name}
                    className={`goal-exercises__letter goal-exercises__letter--${template.letter.toLowerCase()}`}
                    title={template.name}
                    aria-label={template.name}
                  >
                    {template.category === "Musculation" ? template.letter : `${template.category.slice(0, 1)}${template.letter}`}
                  </span>
                ))}
              </span>
            </>
          );
          return (
            <li key={row.exerciseId}>
              {row.inactive || !row.exercise ? (
                <span className="goal-exercises__row goal-exercises__row--inactive">{content}</span>
              ) : (
                <Link to={`/exercises/${row.exerciseId}`} state={{ from: returnTo }} className="goal-exercises__row">
                  {content}
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * M7 — Objectif > Conseils (lot H.5) : fréquence, comment progresser,
 * points techniques, erreurs à éviter ; un premier jet porte le bandeau
 * « Conseils en cours de validation ».
 */
export function GoalAdviceTab({ goal }: { goal: Goal }) {
  const advice = GOAL_ADVICE[goal.adviceKey];
  if (!advice) return <p className="goal-detail__message">Pas encore de conseils pour cet objectif.</p>;

  return (
    <>
      {advice.draft && (
        <p className="goal-advice__draft" role="note">
          <Info size={16} aria-hidden="true" /> Conseils en cours de validation
        </p>
      )}

      <section className="goal-section">
        <h2 className="goal-advice__title">
          <BarChart3 size={18} aria-hidden="true" /> Fréquence recommandée
        </h2>
        <p>{advice.frequency}</p>
        {advice.sessions && (
          <ul className="goal-advice__sessions">
            {advice.sessions.map((session) => (
              <li key={session.letter}>
                <span className={`goal-exercises__letter goal-exercises__letter--${session.letter.toLowerCase()}`}>{session.letter}</span>
                <span>
                  <strong>{session.title}</strong>
                  <br />
                  {session.exercises.join(", ")}
                  <br />
                  {session.aim}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="goal-section">
        <h2 className="goal-advice__title">
          <Target size={18} aria-hidden="true" /> Comment progresser
        </h2>
        <ol className="goal-advice__list">
          {advice.progress.map((item, index) => (
            <li key={index}>
              {item.label && <strong>{item.label} : </strong>}
              {item.text}
            </li>
          ))}
        </ol>
      </section>

      {advice.technique.length > 0 && (
        <section className="goal-section">
          <h2 className="goal-advice__title">
            <Info size={18} aria-hidden="true" /> Points techniques clés
          </h2>
          <ul className="goal-advice__bullets">
            {advice.technique.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="goal-section">
        <h2 className="goal-advice__title">
          <CheckCircle2 size={18} aria-hidden="true" /> Erreurs à éviter
        </h2>
        <ul className="goal-advice__bullets">
          {advice.mistakes.map((item) => (
            <li key={item}>
              <AlertTriangle size={12} aria-hidden="true" /> {item}
            </li>
          ))}
        </ul>
      </section>

      {advice.measure && (
        <section className="goal-section">
          <h2 className="goal-advice__title">
            <Ruler size={18} aria-hidden="true" /> La mesure
          </h2>
          <p>{advice.measure}</p>
        </section>
      )}
    </>
  );
}
