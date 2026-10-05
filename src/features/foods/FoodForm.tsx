import { useState } from "react";
import { calculateNutrients, formatGrams, formatKcal } from "../../domain/rules/nutritionRules";
import { parseQuantityInput, unitWord } from "../../domain/rules/journalRules";
import {
  defaultReferenceQuantity,
  parseFoodForm,
  suggestedQuantity,
  UNIT_CHOICES,
  type FoodFormValues,
  type FoodValues,
  type UnitChoiceKey,
} from "../../domain/rules/foodLibraryRules";
import "./foods.css";

export interface FoodFormProps {
  initial: FoodFormValues;
  /** Création depuis un repas : la partie « ajouter au repas » et son bouton principal. */
  meal?: { addLabel: string; title: string };
  primaryLabel: string;
  onPrimary: (values: FoodValues, quantity?: number) => Promise<void>;
  secondaryLabel?: string;
  onSecondary?: (values: FoodValues) => Promise<void>;
}

/**
 * Formulaire d'aliment (phase 3A.3), le même depuis le Journal et depuis
 * Plus › Aliments. Depuis un repas, la quantité à ajouter se remplit
 * seule (quantité habituelle, sinon de référence) et ne suit plus dès
 * qu'elle est modifiée à la main : rien à saisir deux fois.
 */
export function FoodForm({ initial, meal, primaryLabel, onPrimary, secondaryLabel, onSecondary }: FoodFormProps) {
  const [form, setForm] = useState<FoodFormValues>(initial);
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [quantityText, setQuantityText] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const set = (changes: Partial<FoodFormValues>) => setForm({ ...form, ...changes });
  /* Tant qu'elle n'est pas touchée, la quantité à ajouter suit l'habituelle, sinon la référence. */
  const quantity = quantityText ?? suggestedQuantity(form);
  const choice = UNIT_CHOICES.find((item) => item.key === form.choice)!;
  const labels = choice.key === "other" ? { unitLabel: form.otherLabel.trim(), unitLabelPlural: form.otherPlural.trim() } : { ...(choice.label ? { unitLabel: choice.label } : {}), ...(choice.plural ? { unitLabelPlural: choice.plural } : {}) };
  const unitFor = (text: string) => {
    const read = parseQuantityInput(text);
    return unitWord(read.ok ? read.quantity : 1, choice.unit, labels) || "—";
  };

  const parsed = parseFoodForm(form);
  const consumed = parseQuantityInput(quantity);
  const preview = parsed.ok && consumed.ok ? calculateNutrients(parsed.values, consumed.quantity) : undefined;

  function changeUnit(key: UnitChoiceKey) {
    const next = UNIT_CHOICES.find((item) => item.key === key)!;
    /* « Valeurs pour » : 100 en g ou ml, 1 pour une unité comptée, tant qu'il n'a pas été saisi. */
    set({ choice: key, ...(referenceTouched ? {} : { referenceQuantity: String(defaultReferenceQuantity(next.unit)) }) });
  }

  async function run(action: (values: FoodValues) => Promise<void>) {
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    setError(undefined);
    try {
      await action(parsed.values);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  async function primary() {
    if (!meal) return run((values) => onPrimary(values));
    if (!consumed.ok) return setError(consumed.message);
    return run((values) => onPrimary(values, consumed.quantity));
  }

  const number = (key: "kcal" | "proteinG" | "carbsG" | "fatG", label: string, aria: string, unit: string) => (
    <label className="food-form__field">
      <span>{label}</span>
      <span className="food-form__input">
        <input type="text" inputMode="decimal" autoComplete="off" aria-label={aria} placeholder={key === "kcal" ? "" : "—"} value={form[key]} onChange={(event) => set({ [key]: event.target.value })} />
        <span className="food-form__unit">{unit}</span>
      </span>
    </label>
  );

  return (
    <form
      className="food-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void primary();
      }}
    >
      <label className="food-form__field food-form__field--wide">
        <span>Nom</span>
        <input type="text" aria-label="Nom" autoComplete="off" placeholder="ex. Thon tomate" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </label>

      <div className="food-form__row">
        <label className="food-form__field">
          <span>Unité</span>
          <select aria-label="Unité" value={form.choice} onChange={(event) => changeUnit(event.target.value as UnitChoiceKey)}>
            {UNIT_CHOICES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.text}
              </option>
            ))}
          </select>
        </label>
        <label className="food-form__field">
          <span>Valeurs pour</span>
          <span className="food-form__input">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Valeurs pour"
              value={form.referenceQuantity}
              onChange={(event) => {
                setReferenceTouched(true);
                set({ referenceQuantity: event.target.value });
              }}
            />
            <span className="food-form__unit">{unitFor(form.referenceQuantity)}</span>
          </span>
        </label>
      </div>

      {form.choice === "other" && (
        <div className="food-form__row">
          <label className="food-form__field">
            <span>Nom de l'unité</span>
            <input type="text" aria-label="Nom de l'unité" autoComplete="off" placeholder="ex. sachet" value={form.otherLabel} onChange={(event) => set({ otherLabel: event.target.value })} />
          </label>
          <label className="food-form__field">
            <span>Pluriel</span>
            <input type="text" aria-label="Pluriel (facultatif)" autoComplete="off" placeholder="ex. sachets" value={form.otherPlural} onChange={(event) => set({ otherPlural: event.target.value })} />
          </label>
        </div>
      )}

      {number("kcal", "Calories", "Calories en kcal", "kcal")}
      <div className="food-form__macros">
        {number("proteinG", "Protéines", "Protéines en g (facultatif)", "g")}
        {number("carbsG", "Glucides", "Glucides en g (facultatif)", "g")}
        {number("fatG", "Lipides", "Lipides en g (facultatif)", "g")}
      </div>

      <div className="food-form__row">
        <label className="food-form__field">
          <span>Quantité habituelle</span>
          <span className="food-form__input">
            <input type="text" inputMode="decimal" autoComplete="off" aria-label="Quantité habituelle (facultatif)" placeholder="—" value={form.defaultQuantity} onChange={(event) => set({ defaultQuantity: event.target.value })} />
            <span className="food-form__unit">{unitFor(form.defaultQuantity)}</span>
          </span>
        </label>
        <label className="food-form__favorite">
          <input type="checkbox" checked={form.favorite} onChange={(event) => set({ favorite: event.target.checked })} />
          <span>Favori</span>
        </label>
      </div>

      {meal && (
        <fieldset className="food-form__meal">
          <legend>{meal.title}</legend>
          <label className="food-form__field">
            <span>Quantité</span>
            <span className="food-form__input">
              <input type="text" inputMode="decimal" autoComplete="off" aria-label="Quantité à ajouter" value={quantity} onChange={(event) => setQuantityText(event.target.value)} />
              <span className="food-form__unit">{unitFor(quantity)}</span>
            </span>
          </label>
          <p className="food-form__preview">
            {preview ? `= ${formatKcal(preview.kcal)}${preview.proteinG !== undefined ? ` · ${formatGrams(preview.proteinG)} protéines` : ""}` : "—"}
          </p>
        </fieldset>
      )}

      {error && (
        <p className="food-form__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="food-form__button food-form__button--primary" disabled={busy}>
        {meal ? meal.addLabel : primaryLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button type="button" className="food-form__button" disabled={busy} onClick={() => void run(onSecondary)}>
          {secondaryLabel}
        </button>
      )}
    </form>
  );
}
