import { Hourglass, Minus, PauseCircle, Plus } from "lucide-react";
import type { ActiveRest } from "../../domain";
import { getRestCountdown } from "./engine/workoutTime";
import { formatMmSs, type NextUp } from "./workoutDisplay";
import "./RestCard.css";

interface RestCardProps {
  rest: ActiveRest;
  now: string;
  nextUp: NextUp | undefined;
  paused: boolean;
  busy: boolean;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}

export const REST_ADJUST_STEP_SEC = 30;

/**
 * Carte pleine du repos de fin de série ou de tour (§12) : décompte
 * large recalculé depuis l'heure de fin cible à chaque rendu, barre de
 * progression, `−30 s` / `+30 s`, `Passer`, bloc `Ensuite`. À zéro,
 * `Repos terminé` et le temps réel qui continue — la fin réelle est la
 * validation suivante ou `Passer`, jamais le zéro du compte à rebours.
 * Pendant une pause explicite, le repos continue de courir mais ne
 * comptera pas dans le repos moyen ; les commandes attendent la reprise.
 */
export function RestCard({
  rest,
  now,
  nextUp,
  paused,
  busy,
  onAdjust,
  onSkip,
}: RestCardProps) {
  const countdown = getRestCountdown(rest, now);
  const done = countdown.phase === "done";
  const targetSec = Math.max(1, Math.round(
    (new Date(rest.targetEndAt).getTime() - new Date(rest.startedAt).getTime()) / 1000,
  ));
  const progress = done ? 1 : Math.min(1, countdown.elapsedSec / targetSec);
  const adjusted = targetSec !== rest.plannedDurationSec;
  const locked = busy || paused;

  return (
    <section
      className={`rest-card ${done ? "rest-card--done" : ""} ${paused ? "rest-card--paused" : ""}`}
      aria-live="polite"
    >
      <header className="rest-card__head">
        <span className="rest-card__label">
          <Hourglass size={18} strokeWidth={2} aria-hidden="true" />
          {done ? "Repos terminé" : "Repos"}
        </span>
        <span className="rest-card__planned">
          prévu {formatMmSs(rest.plannedDurationSec)}
          {adjusted && !done ? ` · ajusté ${formatMmSs(targetSec)}` : ""}
        </span>
      </header>

      <p className="rest-card__time">
        {done ? formatMmSs(countdown.elapsedSec) : formatMmSs(countdown.remainingSec)}
        <small>{done ? "réel, en cours" : "restant"}</small>
      </p>

      <div className="rest-card__track" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {paused ? (
        <p className="rest-card__note">
          <PauseCircle size={16} strokeWidth={2} aria-hidden="true" />
          Séance en pause : le repos continue de courir, il ne comptera pas dans le repos moyen.
        </p>
      ) : done ? (
        <p className="rest-card__note">
          Le repos réel court jusqu'à la validation suivante, ou jusqu'à `Passer`.
        </p>
      ) : null}

      {nextUp && (
        <div className="rest-card__next">
          <span className="rest-card__next-label">Ensuite</span>
          <span className="rest-card__next-title">{nextUp.title}</span>
          {nextUp.detail && <span className="rest-card__next-detail">{nextUp.detail}</span>}
        </div>
      )}

      <div className="rest-card__actions">
        <button
          type="button"
          className="rest-card__adjust"
          onClick={() => onAdjust(-REST_ADJUST_STEP_SEC)}
          disabled={locked || done}
          aria-label="Réduire le repos de 30 secondes"
        >
          <Minus size={16} strokeWidth={2.4} aria-hidden="true" />
          30 s
        </button>
        <button
          type="button"
          className="rest-card__skip"
          onClick={onSkip}
          disabled={locked}
        >
          Passer
        </button>
        <button
          type="button"
          className="rest-card__adjust"
          onClick={() => onAdjust(REST_ADJUST_STEP_SEC)}
          disabled={locked || done}
          aria-label="Prolonger le repos de 30 secondes"
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          30 s
        </button>
      </div>
    </section>
  );
}
