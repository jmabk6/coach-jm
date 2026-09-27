import { EllipsisVertical, Moon } from "lucide-react";
import { Link } from "react-router-dom";
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
import { SessionName } from "../sessions/SessionName";
import { splitSessionName } from "../sessions/splitSessionName";

/** Un test attaché à l'instance (lot G.7) : son nom, et s'il est en retard (D26). */
export interface RowTest {
  name: string;
  toReschedule: boolean;
}

interface PlannedSessionRowProps {
  session: PlannedSession;
  template: SessionTemplate | undefined;
  durationLabel: string;
  tests?: RowTest[] | undefined;
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
  tests = [],
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
          <span className="program-row__name"><SessionName name={name} /></span>
          <span className="program-row__meta">{durationLabel}</span>
          {tests.map((test) => (
            <span key={test.name} className="program-row__test">
              Test {test.name.toLocaleLowerCase("fr-FR")}
              {test.toReschedule && <span className="program-badge program-badge--reschedule">À replanifier</span>}
            </span>
          ))}
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

interface EveningRowProps {
  session: PlannedSession;
  template: SessionTemplate | undefined;
  durationLabel: string;
  tests?: RowTest[] | undefined;
  onOpenMenu: (session: PlannedSession) => void;
}

/**
 * Routine du soir, compacte (27/09/2026) : une ligne sous les séances du
 * jour, « Soir : Routine A · 14 min », ses tests en orange. Toucher ouvre
 * la routine ; le menu ⋯ est inchangé (déplacer, sauter…).
 */
export function EveningRow({ session, template, durationLabel, tests = [], onOpenMenu }: EveningRowProps) {
  const name = template ? splitSessionName(template.name).main : "Séance supprimée";
  const minutes = durationLabel.replace(/^(Estimé|Moyenne)\s+/, "");
  const displayedStatus = getDisplayedPlannedSessionStatus(session, formatLocalDate(new Date()));

  return (
    <div className="program-evening">
      <Link to={`/aujourdhui/apercu/${session.id}`} className="program-evening__main">
        <Moon size={15} strokeWidth={2.2} aria-hidden="true" className="program-evening__icon" />
        <span className="program-evening__body">
          <span className="program-evening__line">
            Soir : <strong>{name}</strong>
            {minutes && ` · ${minutes}`}
            {/* Rien à signaler tant qu'elle est à venir, aujourd'hui compris : le jour est déjà marqué. */}
            {displayedStatus !== "upcoming" && displayedStatus !== "today" && (
              <span className={`program-badge program-badge--${displayedStatus}`}>{displayedPlannedSessionStatusLabels[displayedStatus]}</span>
            )}
          </span>
          {tests.length > 0 && (
            <span className="program-evening__tests">
              {tests.map((test) => `Test ${test.name.toLocaleLowerCase("fr-FR")}${test.toReschedule ? " (à replanifier)" : ""}`).join(" · ")}
            </span>
          )}
        </span>
      </Link>
      <button
        type="button"
        className="program-row__menu program-evening__menu"
        aria-label={`Actions pour ${template?.name ?? "la routine"}`}
        onClick={() => onOpenMenu(session)}
      >
        <EllipsisVertical size={18} strokeWidth={2} aria-hidden="true" />
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
