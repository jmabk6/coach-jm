import { EllipsisVertical } from "lucide-react";
import type { PlannedSession, SessionTemplate } from "../../domain";
import { plannedSessionStatusLabels } from "../../domain/rules/programRules";
import { SessionCategoryIcon } from "../sessions/sessionCategory";

interface PlannedSessionRowProps {
  session: PlannedSession;
  template: SessionTemplate | undefined;
  durationLabel: string;
  onOpenMenu: (session: PlannedSession) => void;
}

/**
 * Une occurrence, résumée exactement de la même façon dans la vue Semaine
 * et sous la grille du Mois (§9) : icône de catégorie, nom du modèle,
 * durée `Estimé` / `Moyenne`, badge de statut, menu `⋯`.
 * Toute la ligne ouvre le menu.
 */
export function PlannedSessionRow({
  session,
  template,
  durationLabel,
  onOpenMenu,
}: PlannedSessionRowProps) {
  const name = template?.name ?? "Séance supprimée";

  return (
    <div className="program-row">
      <button
        type="button"
        className="program-row__main"
        onClick={() => onOpenMenu(session)}
      >
        <span
          className={`program-row__icon ${
            template ? `session-card__icon--${template.category}` : ""
          }`}
          aria-hidden="true"
        >
          {template && (
            <SessionCategoryIcon category={template.category} size={22} />
          )}
        </span>

        <span className="program-row__body">
          <span className="program-row__name">{name}</span>
          <span className="program-row__meta">{durationLabel}</span>
        </span>

        <span className={`program-badge program-badge--${session.status}`}>
          {plannedSessionStatusLabels[session.status]}
        </span>
      </button>

      <button
        type="button"
        className="program-row__menu"
        aria-label={`Actions pour ${name}`}
        onClick={() => onOpenMenu(session)}
      >
        <EllipsisVertical size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
