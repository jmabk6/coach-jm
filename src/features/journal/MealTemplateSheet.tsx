import { useState } from "react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { addMealTemplateEntries } from "../../db/repositories/nutritionRepository";
import type { Food, Id, MealSlot, MealTemplate } from "../../domain";
import { parseQuantityInput, unitWord } from "../../domain/rules/journalRules";
import { templateLines } from "../../domain/rules/mealTemplateRules";
import { formatGrams, formatKcal } from "../../domain/rules/nutritionRules";
import { ADD_LABELS } from "./mealLabels";

const STATE_NOTES = {
  archived: "Archivé — non ajouté",
  unit_changed: "Unité modifiée — corriger le repas favori",
  missing: "Aliment introuvable — non ajouté",
} as const;

/**
 * Ajouter un repas favori (phase 3A.4a) : tous les aliments prêts sont
 * cochés et préremplis — un toucher sur « Ajouter » suffit. Quantité
 * modifiable et case à décocher pour cette fois seulement : le repas favori
 * ne change jamais. Un aliment archivé ou d'unité modifiée est signalé,
 * décoché et bloqué (la correction se fait dans le repas favori).
 */
export function MealTemplateSheet({
  template,
  foods,
  date,
  slot,
  onAdded,
  onDismiss,
}: {
  template: MealTemplate;
  foods: ReadonlyMap<Id, Food>;
  date: string;
  slot: MealSlot;
  onAdded: () => void;
  onDismiss: () => void;
}) {
  const initial = templateLines(template, foods);
  const [checked, setChecked] = useState<Record<Id, boolean>>(() => Object.fromEntries(initial.lines.map((line) => [line.item.id, line.state === "ready"])));
  const [texts, setTexts] = useState<Record<Id, string>>(() => Object.fromEntries(template.items.map((item) => [item.id, String(item.quantity).replace(".", ",")])));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const parsed = Object.fromEntries(template.items.map((item) => [item.id, parseQuantityInput(texts[item.id] ?? "")]));
  const quantities: Record<Id, number> = {};
  for (const [id, result] of Object.entries(parsed)) if (result.ok) quantities[id] = result.quantity;
  const view = templateLines(template, foods, quantities);
  const selected = view.lines.filter((line) => line.state === "ready" && checked[line.item.id]);
  const invalid = selected.find((line) => !parsed[line.item.id]!.ok);
  const kcal = selected.reduce((sum, line) => sum + (line.nutrients?.kcal ?? 0), 0);
  const protein = selected.every((line) => line.nutrients?.proteinG !== undefined) ? selected.reduce((sum, line) => sum + line.nutrients!.proteinG!, 0) : undefined;

  async function add() {
    if (invalid) return setError(`${invalid.food?.name ?? "Aliment"} : ${(parsed[invalid.item.id] as { message: string }).message}`);
    setBusy(true);
    try {
      await addMealTemplateEntries({
        date,
        slot,
        mealTemplateId: template.id,
        quantities: Object.fromEntries(selected.map((line) => [line.item.id, quantities[line.item.id]!])),
        excluded: view.lines.filter((line) => !selected.includes(line)).map((line) => line.item.id),
        now: new Date().toISOString(),
      });
      onAdded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      title={template.name}
      actions={[
        {
          label: ADD_LABELS[slot],
          tone: "primary",
          disabled: busy || selected.length === 0,
          hint: selected.length === 0 ? "Aucun aliment à ajouter" : undefined,
          onSelect: () => void add(),
        },
      ]}
      onDismiss={onDismiss}
    >
      <ul className="template-sheet" aria-label="Aliments du repas favori">
        {view.lines.map((line) => {
          const name = line.food?.name ?? "Aliment introuvable";
          const ready = line.state === "ready";
          return (
            <li key={line.item.id} className={`template-sheet__item${ready ? "" : " template-sheet__item--blocked"}`}>
              <label className="template-sheet__check">
                <input
                  type="checkbox"
                  aria-label={`Ajouter : ${name}`}
                  checked={ready && Boolean(checked[line.item.id])}
                  disabled={!ready}
                  onChange={(event) => setChecked({ ...checked, [line.item.id]: event.target.checked })}
                />
                <span className="template-sheet__name">{name}</span>
              </label>
              <span className="food-form__input template-sheet__quantity">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Quantité : ${name}`}
                  disabled={!ready || !checked[line.item.id]}
                  value={texts[line.item.id]}
                  onChange={(event) => setTexts({ ...texts, [line.item.id]: event.target.value })}
                />
                <span className="food-form__unit">{unitWord(quantities[line.item.id] ?? line.item.quantity, line.item.unit, line.item)}</span>
              </span>
              {!ready && <span className="template-sheet__note">{STATE_NOTES[line.state as keyof typeof STATE_NOTES]}</span>}
            </li>
          );
        })}
      </ul>
      <p className="template-sheet__total">
        {selected.length > 0 ? `= ${formatKcal(kcal)}${protein !== undefined ? ` · ${formatGrams(protein)} protéines` : ""}` : "—"}
      </p>
      {error && (
        <p className="food-form__error" role="alert">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}
