import { useState } from "react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { getMealTemplates, saveMealTemplate } from "../../db/repositories/nutritionRepository";
import type { Food, Id, MealSlot } from "../../domain";
import { formatQuantity } from "../../domain/rules/journalRules";
import { TEMPLATE_DEFAULT_SLOTS, type SkipReason, type TemplateFromMeal } from "../../domain/rules/mealTemplateRules";
import { MEAL_SLOT_LABELS } from "../../domain/rules/nutritionRules";

const SKIP_LABELS: Record<SkipReason, string> = {
  estimation: "estimation",
  unit_changed: "unité changée depuis",
  archived: "aliment archivé",
};

/**
 * Enregistrer un repas consommé comme repas favori (phase 3A.4a) : les
 * aliments de la bibliothèque avec leurs quantités totales affichées ; ce
 * qui n'est pas repris (estimations, ancienne unité, aliment archivé) est
 * cité. Nom obligatoire ; repas habituel parmi aucun et les quatre repas.
 * Le Journal ne change pas.
 */
export function SaveTemplateSheet({
  slot,
  content,
  foods,
  onSaved,
  onDismiss,
}: {
  slot: MealSlot;
  content: TemplateFromMeal;
  foods: ReadonlyMap<Id, Food>;
  onSaved: (name: string) => void;
  onDismiss: () => void;
}) {
  const [name, setName] = useState("");
  const [defaultSlot, setDefaultSlot] = useState<MealSlot | "">(TEMPLATE_DEFAULT_SLOTS.includes(slot) ? slot : "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim() === "") return setError("Nom du repas : obligatoire.");
    setBusy(true);
    try {
      const existing = await getMealTemplates({ includeArchived: true });
      const now = new Date().toISOString();
      await saveMealTemplate({
        id: `meal-${crypto.randomUUID()}`,
        name: name.trim(),
        ...(defaultSlot ? { defaultSlot } : {}),
        items: content.items.map((item) => ({ id: `item-${crypto.randomUUID()}`, foodId: item.foodId, quantity: item.quantity })),
        position: existing.reduce((max, template) => Math.max(max, template.position + 1), 0),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      onSaved(name.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      title="Enregistrer comme repas favori"
      actions={[{ label: "Enregistrer le repas favori", tone: "primary", disabled: busy, onSelect: () => void save() }]}
      onDismiss={onDismiss}
    >
      <div className="journal-form">
        <label className="journal-form__wide">
          <span>Nom</span>
          <input type="text" aria-label="Nom du repas favori" placeholder="ex. Déjeuner thon" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="journal-form__wide">
          <span>Repas habituel</span>
          <select className="journal-form__select" aria-label="Repas habituel" value={defaultSlot} onChange={(event) => setDefaultSlot(event.target.value as MealSlot | "")}>
            <option value="">Aucun</option>
            {TEMPLATE_DEFAULT_SLOTS.map((item) => (
              <option key={item} value={item}>
                {MEAL_SLOT_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <ul className="template-preview journal-form__wide" aria-label="Aliments repris">
          {content.items.map((item) => {
            const food = foods.get(item.foodId)!;
            return <li key={item.foodId}>{`${food.name} · ${formatQuantity(item.quantity, food.unit, food)}`}</li>;
          })}
        </ul>
        {content.skipped.map((skipped) => (
          <p key={`${skipped.name}-${skipped.reason}`} className="journal-sheet__note journal-form__wide">{`Non repris : ${skipped.name} (${SKIP_LABELS[skipped.reason]})`}</p>
        ))}
        {error && (
          <p className="journal-form__error journal-form__wide" role="alert">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
