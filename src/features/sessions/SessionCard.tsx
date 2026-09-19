import { Link } from "react-router-dom";
import { ChevronRight, EllipsisVertical, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Exercise,
  Id,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../../domain";
import {
  calculateSessionTemplateDuration,
  formatCompletionCount,
  formatSessionTemplateCardioLine,
  formatSessionTemplateDuration,
  formatSessionTemplateSummary,
  isSessionTemplateScheduled,
  summarizeSessionTemplate,
} from "../../domain/rules/sessionTemplateRules";
import { SessionCategoryIcon } from "./sessionCategory";
import { categoryClassName } from "./sessionCategoryClass";

interface SessionCardProps {
  template: SessionTemplate;
  exerciseById: Map<Id, Exercise>;
  completedWorkouts: WorkoutSession[];
  program: WeeklyProgram | undefined;
  onOpenMenu: (template: SessionTemplate) => void;
}

/**
 * Carte d'un modèle (§5) : icône de catégorie, nom, résumé calculé,
 * badge `Programmée` / `Non programmée` sur sa propre ligne, durée,
 * nombre de réalisations. Le lien couvre la carte ; le menu `⋯` et le
 * chevron sont ses frères, chacun dans sa colonne.
 */
export function SessionCard({
  template,
  exerciseById,
  completedWorkouts,
  program,
  onOpenMenu,
}: SessionCardProps) {
  const summary = summarizeSessionTemplate(template.blocks, exerciseById);
  const cardioLine = formatSessionTemplateCardioLine(summary);
  const scheduled = isSessionTemplateScheduled(template.id, program);

  return (
    <li className="session-card">
      <Link to={`/sessions/${template.id}`} className="session-card__link">
        <SessionCardIcon template={template} />

        <span className="session-card__body">
          <span className="session-card__name">{template.name}</span>
          <span className="session-card__summary">
            {formatSessionTemplateSummary(summary, template.description)}
          </span>
          {cardioLine && (
            <span className="session-card__cardio">{cardioLine}</span>
          )}
        </span>

        <span className="session-card__aside">
          <span
            className={`session-badge ${
              scheduled ? "session-badge--scheduled" : ""
            }`}
          >
            {scheduled ? "Programmée" : "Non programmée"}
          </span>
          <span className="session-card__stat">
            {formatSessionTemplateDuration(
              calculateSessionTemplateDuration(template, completedWorkouts),
            )}
          </span>
          <span className="session-card__stat">
            {formatCompletionCount(completedWorkouts.length)}
          </span>
        </span>
      </Link>

      <button
        type="button"
        className="session-card__menu"
        aria-label={`Actions pour ${template.name}`}
        onClick={() => onOpenMenu(template)}
      >
        <EllipsisVertical size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      <ChevronRight
        className="session-card__chevron"
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    </li>
  );
}

interface SortableSessionCardProps {
  template: SessionTemplate;
}

/**
 * Variante du mode `Réorganiser` : seule la poignée déplace la carte,
 * le reste de la carte n'est plus un lien.
 */
export function SortableSessionCard({ template }: SortableSessionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: template.id });

  return (
    <li
      ref={setNodeRef}
      className={`session-card session-card--sortable ${
        isDragging ? "session-card--dragging" : ""
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="session-card__link">
        <SessionCardIcon template={template} />
        <span className="session-card__body">
          <span className="session-card__name">{template.name}</span>
          <span className="session-card__summary">{template.category}</span>
        </span>
      </div>

      <button
        type="button"
        className="session-card__handle"
        aria-label={`Déplacer ${template.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={22} strokeWidth={2} aria-hidden="true" />
      </button>
    </li>
  );
}

function SessionCardIcon({ template }: { template: SessionTemplate }) {
  return (
    <span
      className={`session-card__icon ${categoryClassName("session-card__icon", template.category)}`}
      aria-hidden="true"
    >
      <SessionCategoryIcon category={template.category} size={24} />
    </span>
  );
}
