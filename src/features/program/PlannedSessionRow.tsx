import { EllipsisVertical } from "lucide-react";
import type {
  Exercise,
  Id,
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import {
  displayedPlannedSessionStatusLabels,
  getDisplayedPlannedSessionStatus,
} from "../../domain/rules/todayRules";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import {
  formatFreeWorkoutSummary,
  inferFreeWorkoutCategory,
} from "./freeWorkouts";

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
  const displayedStatus = getDisplayedPlannedSessionStatus(
    session,
    formatLocalDate(new Date()),
  );

  return (
    <div className="program-row">
      <button
        type="button"
        className="program-row__main"
        onClick={() => onOpenMenu(session)}
      >
        <span
          className={`program-row__icon ${
            template ? categoryClassName("session-card__icon", template.category) : ""
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

        <span className={`program-badge program-badge--${displayedStatus}`}>
          {displayedPlannedSessionStatusLabels[displayedStatus]}
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

interface FreeWorkoutRowProps {
  workout: WorkoutSession;
  exerciseById: Map<Id, Exercise>;
  onOpenMenu: (workout: WorkoutSession) => void;
}

/**
 * Une réalisation libre au calendrier : même structure de ligne,
 * badge `Faite · Libre`, résumé du contenu réellement fait.
 */
export function FreeWorkoutRow({
  workout,
  exerciseById,
  onOpenMenu,
}: FreeWorkoutRowProps) {
  const category = inferFreeWorkoutCategory(workout, exerciseById);

  return (
    <div className="program-row">
      <button
        type="button"
        className="program-row__main"
        onClick={() => onOpenMenu(workout)}
      >
        <span
          className={`program-row__icon ${categoryClassName("session-card__icon", category)}`}
          aria-hidden="true"
        >
          <SessionCategoryIcon category={category} size={22} />
        </span>

        <span className="program-row__body">
          <span className="program-row__name">Séance libre</span>
          <span className="program-row__meta program-row__meta--wrap">
            {formatFreeWorkoutSummary(workout, exerciseById)}
          </span>
        </span>

        <span className="program-badge program-badge--done">Faite · Libre</span>
      </button>

      <button
        type="button"
        className="program-row__menu"
        aria-label="Actions pour la séance libre"
        onClick={() => onOpenMenu(workout)}
      >
        <EllipsisVertical size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
