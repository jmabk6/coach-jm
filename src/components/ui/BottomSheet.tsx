import { useEffect, type ReactNode } from "react";
import "./BottomSheet.css";

export interface SheetAction {
  label: string;
  /**
   * Conséquence de l'action, affichée en sous-titre (§18) :
   * une action irréversible porte toujours la sienne.
   */
  hint?: string | undefined;
  tone?: "default" | "primary" | "danger";
  /**
   * Action indisponible : grisée avec sa raison dans `hint`, jamais masquée (§9).
   */
  disabled?: boolean;
  onSelect: () => void;
}

interface BottomSheetProps {
  title: string;
  message?: string | undefined;
  actions: SheetAction[];
  /**
   * Libellé de l'action de repli, toujours présente et jamais destructive.
   */
  dismissLabel?: string;
  onDismiss: () => void;
  children?: ReactNode;
}

/**
 * Feuille d'actions montée depuis le bas : confirmations, menus `⋯`.
 *
 * Les actions destructives y sont distinctes des actions douces et
 * portent leur conséquence ; le repli est toujours la dernière entrée.
 */
export function BottomSheet({
  title,
  message,
  actions,
  dismissLabel = "Annuler",
  onDismiss,
  children,
}: BottomSheetProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      className="bottom-sheet__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottom-sheet-title"
      >
        <header className="bottom-sheet__header">
          <h2 id="bottom-sheet-title">{title}</h2>
          {message && <p>{message}</p>}
        </header>

        {children}

        <div className="bottom-sheet__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`bottom-sheet__action bottom-sheet__action--${
                action.tone ?? "default"
              }`}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              <span className="bottom-sheet__action-label">{action.label}</span>
              {action.hint && (
                <span className="bottom-sheet__action-hint">{action.hint}</span>
              )}
            </button>
          ))}

          <button
            type="button"
            className="bottom-sheet__action bottom-sheet__action--dismiss"
            onClick={onDismiss}
          >
            {dismissLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
