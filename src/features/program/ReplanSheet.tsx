import { useEffect, useState } from "react";
import { addDays, parseISO } from "date-fns";
import type { Id, PlannedSession, SessionTemplate } from "../../domain";
import { getPlannedSessionsBetween } from "../../db/repositories/programRepository";
import {
  formatFullDate,
  formatLocalDate,
  formatShortDay,
  getWeekStartDate,
  isFutureWeek,
} from "../../domain/rules/programRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { generateProgramWeek } from "./generateProgramWeek";

/** Séances proposées : les deux semaines qui viennent. */
const HORIZON_DAYS = 14;

function shift(date: string, days: number): string {
  return formatLocalDate(addDays(parseISO(date), days));
}

interface ReplanSheetProps {
  from: PlannedSession;
  testName: string;
  templateById: Map<Id, SessionTemplate>;
  today: string;
  onConfirm: (target: PlannedSession) => void;
  onDismiss: () => void;
}

/**
 * « Replanifier » un test en retard (D26, M2) : il part sur une autre
 * séance à venir des deux semaines suivantes ; le test d'origine est
 * marqué replanifié. Jamais converti en test passé : la saisie d'un test
 * passé reste un geste distinct (Plus > Protocoles de tests).
 */
export function ReplanSheet({ from, testName, templateById, today, onConfirm, onDismiss }: ReplanSheetProps) {
  const last = shift(today, HORIZON_DAYS - 1);
  const [sessions, setSessions] = useState<PlannedSession[]>();
  const [target, setTarget] = useState<PlannedSession>();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      for (let week = getWeekStartDate(today); week <= last; week = shift(week, 7)) {
        if (isFutureWeek(week, today)) await generateProgramWeek(week);
      }
      const found = await getPlannedSessionsBetween(today, last);
      if (!cancelled) {
        setSessions(
          found
            .filter((item) => !item.removedAt && item.status === "upcoming" && item.id !== from.id)
            .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
        );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [today, last, from.id]);

  const name = (item: PlannedSession) => templateById.get(item.sessionTemplateId)?.name ?? "Séance";

  return (
    <BottomSheet
      title={`Replanifier le test ${testName.toLocaleLowerCase("fr-FR")}`}
      message={`Prévu le ${formatFullDate(from.date)} avec ${name(from)}. Il part sur la séance choisie ; il n'est jamais compté comme fait.`}
      actions={[
        {
          label: target ? `Replanifier sur ${formatShortDay(target.date)} — ${name(target)}` : "Choisissez une séance",
          tone: "primary",
          disabled: !target,
          onSelect: () => {
            if (target) onConfirm(target);
          },
        },
      ]}
      onDismiss={onDismiss}
    >
      {sessions === undefined ? (
        <p>Chargement…</p>
      ) : sessions.length === 0 ? (
        <p>Aucune séance à venir dans les deux semaines.</p>
      ) : (
        <ul className="move-sheet__days" role="radiogroup" aria-label="Séance d'accueil du test">
          {sessions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="radio"
                aria-checked={target?.id === item.id}
                className="move-sheet__day"
                onClick={() => setTarget(item)}
              >
                <span className="move-sheet__date">{formatShortDay(item.date)}</span>
                <span className="move-sheet__content">
                  {name(item)}
                  {item.slot === "evening" ? " (soir)" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
