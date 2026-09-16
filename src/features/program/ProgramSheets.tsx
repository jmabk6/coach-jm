import { useState } from "react";
import { Info } from "lucide-react";
import type { Id, PlannedSession, SessionTemplate, WorkoutSession } from "../../domain";
import {
  formatFullDate,
  formatPlannedSessionTitle,
  listPlannedSessionActions,
  plannedSessionStatusLabels,
  type PlannedSessionAction,
} from "../../domain/rules/programRules";
import { BottomSheet, type SheetAction } from "../../components/ui/BottomSheet";

/* -------------------------------------------------------------------------- */
/* Choix d'un modèle                                                          */
/* -------------------------------------------------------------------------- */

interface TemplateSheetProps {
  title: string;
  message?: string | undefined;
  templates: SessionTemplate[];
  durationLabel: (templateId: Id) => string;
  /**
   * Libellé de l'entrée « aucun modèle », quand vider est un choix
   * légitime (règle hebdomadaire).
   */
  noneLabel?: string | undefined;
  onPick: (templateId: Id | undefined) => void;
  onDismiss: () => void;
}

/**
 * Feuille de choix d'un modèle actif : ajout ponctuel, remplacement,
 * affectation d'une journée de la règle.
 */
export function TemplateSheet({
  title,
  message,
  templates,
  durationLabel,
  noneLabel,
  onPick,
  onDismiss,
}: TemplateSheetProps) {
  const actions: SheetAction[] = templates.map((template) => ({
    label: template.name,
    hint: `${template.category} · ${durationLabel(template.id)}`,
    onSelect: () => onPick(template.id),
  }));

  if (noneLabel) {
    actions.push({
      label: noneLabel,
      tone: "danger",
      onSelect: () => onPick(undefined),
    });
  }

  return (
    <BottomSheet
      title={title}
      message={
        templates.length === 0
          ? "Aucune séance active. Créez d'abord un modèle dans Plus › Séances."
          : message
      }
      actions={actions}
      onDismiss={onDismiss}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Choix d'une date                                                           */
/* -------------------------------------------------------------------------- */

interface DateSheetProps {
  title: string;
  message?: string | undefined;
  initialDate: string;
  confirmLabel: (date: string) => string;
  onConfirm: (date: string) => void;
  onDismiss: () => void;
}

/**
 * Feuille de choix d'une date : déplacement, duplication, ajout.
 * Le bouton de confirmation répète la date choisie en toutes lettres.
 */
export function DateSheet({
  title,
  message,
  initialDate,
  confirmLabel,
  onConfirm,
  onDismiss,
}: DateSheetProps) {
  const [date, setDate] = useState(initialDate);

  return (
    <BottomSheet
      title={title}
      message={message}
      actions={[
        {
          label: confirmLabel(date),
          hint: formatFullDate(date),
          tone: "primary",
          onSelect: () => onConfirm(date),
        },
      ]}
      onDismiss={onDismiss}
    >
      <label className="program-date-field">
        <span>Date</span>
        <input
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) setDate(event.target.value);
          }}
        />
      </label>
    </BottomSheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Menu d'une occurrence                                                      */
/* -------------------------------------------------------------------------- */

interface PlannedSessionMenuProps {
  session: PlannedSession;
  templateName: string;
  onAction: (action: PlannedSessionAction) => void;
  onDismiss: () => void;
}

/**
 * Le menu d'une occurrence (§9) : titré par l'instance, actions selon
 * le statut, action indisponible grisée avec sa raison. Le même menu
 * sert aux vues Semaine et Mois — aucune logique propre au calendrier.
 */
export function PlannedSessionMenu({
  session,
  templateName,
  onAction,
  onDismiss,
}: PlannedSessionMenuProps) {
  const actions: SheetAction[] = listPlannedSessionActions(session).map(
    (entry) => {
      const pending = pendingReason(entry.action);
      const reason = entry.unavailableReason ?? pending;

      return {
        label: entry.label,
        hint: reason,
        disabled: Boolean(reason),
        tone: entry.action === "remove" ? "danger" : "default",
        onSelect: () => onAction(entry.action),
      };
    },
  );

  return (
    <BottomSheet
      title={formatPlannedSessionTitle(templateName, session.date)}
      message={plannedSessionStatusLabels[session.status]}
      actions={actions}
      dismissLabel={session.status === "upcoming" ? "Annuler" : "Fermer"}
      onDismiss={onDismiss}
    >
      {session.status === "done" && (
        <p className="program-notice">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            Les séances réalisées ne peuvent pas être retirées afin de
            conserver votre historique. Pour la refaire, dupliquez-la.
          </span>
        </p>
      )}
    </BottomSheet>
  );
}

interface FreeWorkoutMenuProps {
  workout: WorkoutSession;
  onDismiss: () => void;
}

/**
 * Menu d'une réalisation libre : elle n'est pas une instance, rien ne se
 * déplace ni ne se retire ; seul le récapitulatif (Étape 7) la concerne.
 */
export function FreeWorkoutMenu({ workout, onDismiss }: FreeWorkoutMenuProps) {
  return (
    <BottomSheet
      title={formatPlannedSessionTitle("Séance libre", workout.date)}
      message="Faite · réalisée hors Programme, la règle hebdomadaire n'est pas concernée"
      actions={[
        {
          label: "Voir le récapitulatif",
          hint: pendingReason("recap"),
          disabled: true,
          onSelect: () => undefined,
        },
      ]}
      dismissLabel="Fermer"
      onDismiss={onDismiss}
    />
  );
}

/**
 * Le démarrage et le récapitulatif relèvent des Étapes 6 et 7 :
 * les entrées existent déjà, grisées, plutôt qu'absentes.
 */
function pendingReason(action: PlannedSessionAction): string | undefined {
  switch (action) {
    case "start":
      return "Bientôt : le moteur de séance arrive à l'Étape 6";
    case "recap":
      return "Bientôt : le récapitulatif arrive à l'Étape 7";
    default:
      return undefined;
  }
}
