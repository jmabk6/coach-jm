import { Hourglass } from "lucide-react";
import type { ActiveRest } from "../../domain";
import { getRestCountdown } from "./engine/workoutTime";
import { formatMmSs } from "./workoutDisplay";

interface RestBandProps {
  rest: ActiveRest;
  now: string;
  busy: boolean;
  onSkip: () => void;
}

/**
 * `Repos avant cet exercice` (§12) : la seconde échelle — une bande
 * d'une ligne dans le bloc du tour, `Passer` seulement, ni `−30 s` /
 * `+30 s`, ni barre basse persistante, ni bloc `Ensuite`. Le restant
 * se recalcule depuis l'heure de fin cible, comme partout.
 */
export function RestBand({ rest, now, busy, onSkip }: RestBandProps) {
  const countdown = getRestCountdown(rest, now);

  return (
    <div className={`rest-band ${countdown.phase === "done" ? "rest-band--done" : ""}`} role="status">
      <Hourglass size={16} strokeWidth={2} aria-hidden="true" />
      <span className="rest-band__text">
        {countdown.phase === "running"
          ? `Repos avant cet exercice · ${formatMmSs(countdown.remainingSec)} restant`
          : `Repos avant cet exercice terminé · réel ${formatMmSs(countdown.elapsedSec)}`}
        <small>prévu {formatMmSs(rest.plannedDurationSec)}</small>
      </span>
      <button type="button" className="rest-band__skip" onClick={onSkip} disabled={busy}>
        Passer
      </button>
    </div>
  );
}
