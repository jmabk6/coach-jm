import { Hourglass } from "lucide-react";
import type { ActiveRest } from "../../domain";
import { getRestCountdown } from "./engine/workoutTime";
import { formatMmSs } from "./workoutDisplay";

interface RestBarProps {
  rest: ActiveRest;
  now: string;
  busy: boolean;
  paused: boolean;
  onSkip: () => void;
}

/**
 * Barre basse persistante du repos (§12) : le restant est recalculé
 * depuis l'heure de fin cible à chaque battement, jamais décrémenté.
 * À zéro, `Repos terminé` et le temps réellement écoulé qui continue de
 * courir — la fin réelle est la validation suivante ou `Passer`.
 * Elle double la carte pleine (`RestCard`) quand on a fait défiler la page.
 */
export function RestBar({ rest, now, busy, paused, onSkip }: RestBarProps) {
  const countdown = getRestCountdown(rest, now);
  const progress =
    countdown.phase === "running"
      ? Math.min(1, countdown.elapsedSec / Math.max(1, rest.plannedDurationSec))
      : 1;

  return (
    <div
      className={`rest-bar ${countdown.phase === "done" ? "rest-bar--done" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="rest-bar__track" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="rest-bar__row">
        <Hourglass size={18} strokeWidth={2} aria-hidden="true" />
        <span className="rest-bar__text">
          {countdown.phase === "running" ? (
            <>
              <strong>Repos {formatMmSs(countdown.remainingSec)}</strong>
              <small>
                {paused ? "séance en pause · " : ""}prévu {formatMmSs(rest.plannedDurationSec)}
              </small>
            </>
          ) : (
            <>
              <strong>Repos terminé</strong>
              <small>
                réel {formatMmSs(countdown.elapsedSec)} · prévu {formatMmSs(rest.plannedDurationSec)}
              </small>
            </>
          )}
        </span>
        <button type="button" className="rest-bar__skip" onClick={onSkip} disabled={busy || paused}>
          Passer
        </button>
      </div>
    </div>
  );
}
