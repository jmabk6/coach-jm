import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import type { DayTarget, Exercise } from "../../domain";
import { formatTargetLines } from "./dayTargetFormat";
import type { SessionOutcome } from "../../domain/rules/progressionRules";
import "./DayTargetBlock.css";

const reserveOf = (rpeMax: number | undefined) => (rpeMax === undefined ? undefined : Math.max(0, 10 - rpeMax));

/**
 * Bloc « Objectif du jour » (lot P2, 22/10/2026), sous le nom de
 * l'exercice : l'objectif figé au début de la séance, la dernière fois, la
 * consigne de réserve et le lien vers la perspective. Remplace « Pour
 * valider » et « Conseillé » ; ne touche ni au chrono ni aux séries.
 */

interface DayTargetBlockProps {
  target: DayTarget;
  exercise: Exercise | undefined;
  /** « 55 kg · 8/8/6 · RPE 8/9/9 », s'il y a une dernière fois. */
  lastLine?: string | undefined;
  lastDate?: string | undefined;
  /** Retour après la dernière série, une fois toutes les séries de l'objectif notées. */
  outcome?: SessionOutcome | undefined;
}

export function DayTargetBlock({ target, exercise, lastLine, lastDate, outcome }: DayTargetBlockProps) {
  const perDumbbell = exercise?.equipment === "Haltères";
  const lines = formatTargetLines(target, perDumbbell);
  const reserve = reserveOf(target.rpeMax);
  const suspended = target.kind === "suspended";
  const insufficient = target.kind === "insufficient";
  const title = suspended ? "Progression suspendue" : insufficient ? "Pas encore d’objectif" : "Objectif du jour";

  return (
    <section className={`day-target${suspended ? " day-target--suspended" : ""}`} aria-label="Objectif du jour">
      <p className="day-target__head">
        <Target size={16} strokeWidth={2.2} aria-hidden="true" />
        <strong>{title}</strong>
        {!suspended && !insufficient && target.rpeMax !== undefined && <span className="day-target__rpe">RPE ≤ {target.rpeMax}</span>}
      </p>
      {lines.map((line) => (
        <p key={line} className="day-target__goal">
          {line}
        </p>
      ))}
      {lastLine && !suspended && (
        <p className="day-target__last">
          Dernière fois{lastDate ? ` (${lastDate})` : ""} : {lastLine}
        </p>
      )}
      <p className="day-target__reason">{target.reason}</p>
      {!suspended && !insufficient && reserve !== undefined && (
        <p className="day-target__hint">
          Dépassement possible sur n’importe quelle série, en gardant {reserve} répétition{reserve > 1 ? "s" : ""} en réserve.
        </p>
      )}
      {outcome && <p className={`day-target__outcome day-target__outcome--${outcome.kind}`}>{outcome.text}</p>}
      {exercise && (
        <Link className="day-target__link" to={`/exercises/${exercise.id}`}>
          Voir ma perspective ›
        </Link>
      )}
    </section>
  );
}
