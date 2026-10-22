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
  /**
   * Repos parti de « Série terminée » (simplifié le 22/10/2026) : ni
   * `Passer` ni repos réel ; −30 s / +30 s seulement, on reprend quand on veut.
   */
  canSkip?: boolean;
  /**
   * Entre deux séries (15/10/2026) : une ligne pour le temps, une pour
   * les commandes, pour rester visible avec la saisie sur iPhone.
   */
  compact?: boolean;
}

export const REST_ADJUST_STEP_SEC = 30;

/**
 * Carte pleine du repos de fin de série ou de tour (§12) : décompte
 * large recalculé depuis l'heure de fin cible à chaque rendu, barre de
 * progression, `−30 s` / `+30 s`, `Passer`, bloc `Ensuite`. À zéro,
 * `Repos terminé` et le temps réel qui continue — la fin réelle est la
 * validation suivante ou `Passer`, jamais le zéro du compte à rebours.
 * Après zéro, `+30 s` relance un décompte de 30 s depuis le geste sans
 * remettre le repos réel à zéro ; `−30 s` n'a plus d'objet.
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
  canSkip = true,
  compact = false,
}: RestCardProps) {
  const countdown = getRestCountdown(rest, now);
  const done = countdown.phase === "done";
  const targetSec = Math.max(1, Math.round(
    (new Date(rest.targetEndAt).getTime() - new Date(rest.startedAt).getTime()) / 1000,
  ));
  const progress = done ? 1 : Math.min(1, countdown.elapsedSec / targetSec);
  const adjusted = (rest.adjustmentSec ?? 0) !== 0;
  const locked = busy || paused;

  return (
    <section
      className={`rest-card ${done ? "rest-card--done" : ""} ${paused ? "rest-card--paused" : ""} ${compact ? "rest-card--compact" : ""}`}
      aria-live="polite"
    >
      <header className="rest-card__head">
        <span className="rest-card__label">
          <Hourglass size={18} strokeWidth={2} aria-hidden="true" />
          {done ? "Repos terminé" : "Repos"}
        </span>
        {/* Entre deux séries (22/10/2026) : pas de temps écoulé une fois le décompte fini — seul le repos prévu compte. */}
        {compact && !done && (
          <span className="rest-card__time rest-card__time--inline">
            {formatMmSs(countdown.remainingSec)}
            <small>restant</small>
          </span>
        )}
        <span className="rest-card__planned">
          prévu {formatMmSs(rest.plannedDurationSec)}
          {adjusted
            ? ` · ajusté ${rest.adjustmentSec! > 0 ? "+" : "−"}${formatMmSs(Math.abs(rest.adjustmentSec!))}`
            : ""}
        </span>
      </header>

      {!compact && (
        <p className="rest-card__time">
          {done ? formatMmSs(countdown.elapsedSec) : formatMmSs(countdown.remainingSec)}
          <small>{done ? "réel, en cours" : "restant"}</small>
        </p>
      )}

      <div className="rest-card__track" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {paused ? (
        <p className="rest-card__note">
          <PauseCircle size={16} strokeWidth={2} aria-hidden="true" />
          Séance en pause : le repos continue de courir, il ne comptera pas dans le repos moyen.
        </p>
      ) : done && !compact ? (
        <p className="rest-card__note">
          {canSkip
            ? "Le repos réel court jusqu'à la validation suivante, ou jusqu'à `Passer` ; `+30 s` relance un décompte sans le remettre à zéro."
            : "Reprends quand tu es prêt ; `+30 s` relance un décompte de 30 s."}
        </p>
      ) : null}

      {nextUp && compact && (
        <p className="rest-card__next-line">
          Ensuite : <strong>{nextUp.title}</strong>
          {nextUp.detail ? ` · ${nextUp.detail}` : ""}
        </p>
      )}

      {nextUp && !compact && (
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
        {canSkip && (
          <button type="button" className="rest-card__skip" onClick={onSkip} disabled={locked}>
            Passer
          </button>
        )}
        <button
          type="button"
          className="rest-card__adjust"
          onClick={() => onAdjust(REST_ADJUST_STEP_SEC)}
          disabled={locked}
          aria-label={done ? "Relancer 30 secondes de repos" : "Prolonger le repos de 30 secondes"}
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          30 s
        </button>
      </div>
    </section>
  );
}
