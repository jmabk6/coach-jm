import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { PlannedSession } from "../../domain";
import { isLockedPlannedSession } from "../../domain/rules/programRules";

/**
 * Glisser-déposer du Planning Semaine (27/09/2026) : même bibliothèque,
 * même poignée ⋮⋮ à droite et même geste que l'éditeur de séance. Une
 * séance se glisse vers un autre jour de la semaine affichée ; une séance
 * faite ou en cours n'a pas de poignée. Retour visuel uniquement.
 */

export interface DragData {
  session: PlannedSession;
}

function canDrag(session: PlannedSession): boolean {
  return !session.removedAt && !isLockedPlannedSession(session);
}

export function DraggableSession({ session, label, children }: { session: PlannedSession; label: string; children: ReactNode }) {
  const draggable = canDrag(session);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    data: { session } satisfies DragData,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      className={`program-drag ${draggable ? "program-drag--draggable" : ""} ${isDragging ? "program-drag--dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      {children}
      {draggable && (
        <button type="button" className="program-drag__handle" aria-label={`Déplacer ${label}`} {...attributes} {...listeners}>
          <GripVertical size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Un jour de la semaine, cible du dépôt ; surligné quand une séance le survole. */
export function DroppableDay({ date, className, children }: { date: string; className: string; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: date });
  const from = (active?.data.current as DragData | undefined)?.session.date;
  const over = isOver && from !== undefined && from !== date;

  return (
    <li ref={setNodeRef} className={`${className} ${over ? "program-day--drop" : ""}`} data-date={date}>
      {children}
    </li>
  );
}
