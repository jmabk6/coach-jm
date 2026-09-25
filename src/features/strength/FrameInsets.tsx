import type { RaiseProposal, Stagnation } from "../../domain/rules/strengthRules";
import { formatStrengthValue } from "../../domain/rules/strengthRules";
import "./FrameSection.css";

/**
 * Encarts de progression d'un cadre (spec § 7, lot 4C), partagés par la
 * fiche exercice et la séance en cours (lot M.1) : « Augmentation
 * proposée » — accepter ou rester — et « Stagnation à examiner », qui ne
 * décide rien.
 */

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function RaiseInset({
  raise,
  busy,
  onAccept,
  onStay,
}: {
  raise: RaiseProposal;
  busy: boolean;
  onAccept: () => void;
  onStay: () => void;
}) {
  return (
    <aside className="frame-section__suggestion" aria-label="Hausse proposée">
      <strong>Augmentation proposée</strong>
      <p>
        Palier {formatStrengthValue(raise.milestone.value, raise.unit)} validé le {formatDate(raise.milestone.date)}.
        Cran suivant : <strong>{formatStrengthValue(raise.value, raise.unit)}</strong>
        {raise.repFloor !== undefined ? `, en repartant du bas de la plage (${raise.repFloor} répétitions)` : ""}.
        Rien ne change tant que vous n'acceptez pas.
      </p>
      <div className="frame-section__actions">
        <button type="button" className="frame-section__primary" disabled={busy} onClick={onAccept}>
          Accepter le nouveau palier
        </button>
        <button type="button" className="frame-section__secondary" disabled={busy} onClick={onStay}>
          Rester à {formatStrengthValue(raise.milestone.value, raise.unit)}
        </button>
      </div>
    </aside>
  );
}

export function StagnationInset({ stagnation }: { stagnation: Stagnation }) {
  return (
    <aside className="frame-section__suggestion frame-section__suggestion--warn" aria-label="Stagnation à examiner">
      <strong>Stagnation à examiner</strong>
      <p>
        Trois séances à {formatStrengthValue(stagnation.load, stagnation.unit)} sans progrès sur le total
        {stagnation.unit === "sec" ? " de secondes" : " de répétitions"} :
      </p>
      <ul>
        {stagnation.sessions.map((session) => (
          <li key={session.workoutId}>
            {formatDate(session.date)} — total {session.total}
            {stagnation.unit === "sec" ? " s" : " reps"}
          </li>
        ))}
      </ul>
      <p>
        Pistes, sans décision : revenir au cran précédent, poursuivre, vérifier le repos. Réduire le nombre de séries
        serait un changement de cadre (« Modifier »), pas un ajustement de charge.
      </p>
    </aside>
  );
}
