import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Copy, Replace, SkipForward } from "lucide-react";
import { addDays, parseISO } from "date-fns";
import type { Id, PlannedSession, SessionTemplate } from "../../domain";
import { getPlannedSessionsBetween } from "../../db/repositories/programRepository";
import {
  allowedMoveChoices,
  findMoveConflict,
  formatFullDate,
  formatLocalDate,
  formatMoveConfirmLabel,
  formatShortDay,
  getWeekStartDate,
  isFutureWeek,
  type MoveChoice,
} from "../../domain/rules/programRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { generateProgramWeek } from "./generateProgramWeek";

/** Jours proposés d'office : les deux semaines qui viennent. */
const MOVE_HORIZON_DAYS = 14;

const CHOICES: ReadonlyArray<{ choice: MoveChoice; label: string; icon: typeof Copy }> = [
  { choice: "swap", label: "Échanger", icon: ArrowLeftRight },
  { choice: "both", label: "Faire les deux", icon: Copy },
  { choice: "replace", label: "Remplacer", icon: Replace },
];

function shift(date: string, days: number): string {
  return formatLocalDate(addDays(parseISO(date), days));
}

interface MoveSheetProps {
  session: PlannedSession;
  templateById: Map<Id, SessionTemplate>;
  today: string;
  onConfirm: (date: string, choice: MoveChoice | undefined) => void;
  /** Sauter (D26) : proposé dans la feuille pour une séance à venir. */
  onSkip?: (() => void) | undefined;
  onDismiss: () => void;
}

/**
 * Feuille « Déplacer la séance » (M2, conception V2 § 2.7) : les jours qui
 * viennent avec leur contenu, une autre date au besoin. Quand le jour
 * choisi porte déjà une séance du même créneau : Échanger, Faire les deux
 * ou Remplacer — seul « Faire les deux » face à une séance faite ou en
 * cours. Le bouton du bas reprend le choix fait.
 */
export function MoveSheet({ session, templateById, today, onConfirm, onSkip, onDismiss }: MoveSheetProps) {
  const first = today;
  const last = shift(today, MOVE_HORIZON_DAYS - 1);
  const [date, setDate] = useState<string>();
  const [choice, setChoice] = useState<MoveChoice>();
  const [sessions, setSessions] = useState<PlannedSession[]>();
  const [otherDate, setOtherDate] = useState<string>();

  const loadFrom = otherDate && otherDate < first ? otherDate : first;
  const loadTo = otherDate && otherDate > last ? otherDate : last;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      /* Semaines futures générées à la volée, comme dans le Planning. */
      for (let week = getWeekStartDate(loadFrom); week <= loadTo; week = shift(week, 7)) {
        if (isFutureWeek(week, today)) await generateProgramWeek(week);
      }
      const found = await getPlannedSessionsBetween(loadFrom, loadTo);
      if (!cancelled) setSessions(found.filter((item) => !item.removedAt));
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadFrom, loadTo, today]);

  const name = (item: PlannedSession) => templateById.get(item.sessionTemplateId)?.name ?? "Séance";
  const days = Array.from({ length: MOVE_HORIZON_DAYS }, (_, index) => shift(first, index)).filter(
    (day) => day !== session.date,
  );
  const conflict = date && sessions ? findMoveConflict(session, date, sessions) : undefined;
  const allowed = conflict ? allowedMoveChoices(conflict) : [];
  const effectiveChoice = choice && allowed.includes(choice) ? choice : undefined;
  const ready = date !== undefined && sessions !== undefined && (!conflict || effectiveChoice !== undefined);

  function pick(day: string) {
    setDate(day);
    setChoice(undefined);
  }

  return (
    <BottomSheet
      title="Déplacer la séance"
      message={`${name(session)} — ${formatFullDate(session.date)}. La règle hebdomadaire n'est pas modifiée.`}
      actions={[
        {
          label: date ? formatMoveConfirmLabel(date, conflict ? name(conflict) : undefined, effectiveChoice) : "Choisissez un jour",
          tone: "primary",
          disabled: !ready,
          onSelect: () => {
            if (ready && date) onConfirm(date, conflict ? effectiveChoice : undefined);
          },
        },
      ]}
      onDismiss={onDismiss}
    >
      <p className="move-sheet__heading">Choisir une nouvelle date</p>
      <ul className="move-sheet__days" role="radiogroup" aria-label="Nouvelle date">
        {days.map((day) => {
          const content = (sessions ?? []).filter((item) => item.date === day);
          return (
            <li key={day}>
              <button
                type="button"
                role="radio"
                aria-checked={date === day}
                className="move-sheet__day"
                onClick={() => pick(day)}
              >
                <span className="move-sheet__date">{formatShortDay(day)}</span>
                <span className="move-sheet__content">
                  {sessions === undefined
                    ? "…"
                    : content.length === 0
                      ? "Repos"
                      : content.map((item) => `${name(item)}${item.slot === "evening" ? " (soir)" : ""}`).join(" · ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="program-date-field move-sheet__other">
        <span>Autre date</span>
        <input
          type="date"
          value={otherDate ?? ""}
          onChange={(event) => {
            if (!event.target.value || event.target.value === session.date) return;
            setOtherDate(event.target.value);
            pick(event.target.value);
          }}
        />
      </label>

      {conflict && date && (
        <div className="move-sheet__conflict" role="group" aria-label="Ce jour a déjà une séance">
          <p className="move-sheet__conflict-title">
            <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              Ce jour a déjà une séance : {name(conflict)}
              {allowed.length === 1 && " (déjà commencée ou faite : elle ne peut être ni échangée ni remplacée)"}
            </span>
          </p>
          <div className="move-sheet__choices">
            {CHOICES.map(({ choice: value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`move-sheet__choice move-sheet__choice--${value}`}
                aria-pressed={effectiveChoice === value}
                disabled={!allowed.includes(value)}
                onClick={() => setChoice(value)}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {onSkip && (
        <button type="button" className="move-sheet__skip" onClick={onSkip}>
          <SkipForward size={18} strokeWidth={2} aria-hidden="true" />
          <span>Sauter cette séance</span>
        </button>
      )}
    </BottomSheet>
  );
}
