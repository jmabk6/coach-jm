import { useState } from "react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { addEstimatedExtra } from "../../db/repositories/nutritionRepository";
import type { MealSlot } from "../../domain";
import { parseEstimateForm, type EstimateFormValues } from "../../domain/rules/journalRules";
import { MEAL_SLOT_LABELS } from "../../domain/rules/nutritionRules";

const EMPTY: EstimateFormValues = { name: "", kcal: "", proteinG: "", carbsG: "", fatG: "" };

const MACRO_FIELDS = [
  { key: "proteinG", label: "Protéines" },
  { key: "carbsG", label: "Glucides" },
  { key: "fatG", label: "Lipides" },
] as const;

/**
 * Estimation (phase 3A.2) : une ligne du repas choisi, marquée « estimé » —
 * kcal obligatoires, nom et macros facultatifs. « Estimé » caractérise la
 * ligne, pas le repas. En 3A.3, ce même formulaire devient une option de
 * l'écran Ajouter.
 */
export function EstimateSheet({ date, slot, onSaved, onDismiss }: { date: string; slot: MealSlot; onSaved: () => void; onDismiss: () => void }) {
  const [form, setForm] = useState<EstimateFormValues>(EMPTY);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = parseEstimateForm(form);
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    try {
      await addEstimatedExtra({ date, slot, ...(parsed.name ? { name: parsed.name } : {}), nutrients: parsed.nutrients, now: new Date().toISOString() });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      title={`Estimation · ${MEAL_SLOT_LABELS[slot]}`}
      message="Une valeur approchée, marquée ≈ estimé. Seules les calories sont obligatoires."
      actions={[{ label: "Enregistrer", tone: "primary", disabled: busy, onSelect: () => void save() }]}
      onDismiss={onDismiss}
    >
      <div className="journal-form">
        <label className="journal-form__wide">
          <span>Nom</span>
          <input type="text" aria-label="Nom (facultatif)" placeholder="ex. Restaurant" autoComplete="off" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="journal-form__wide">
          <span>Calories</span>
          <span className="journal-form__unit">
            <input type="text" inputMode="decimal" aria-label="Calories en kcal" placeholder="650" autoComplete="off" value={form.kcal} onChange={(event) => setForm({ ...form, kcal: event.target.value })} />
            kcal
          </span>
        </label>
        {MACRO_FIELDS.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <span className="journal-form__unit">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${label} en g (facultatif)`}
                placeholder="—"
                autoComplete="off"
                value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
              g
            </span>
          </label>
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
