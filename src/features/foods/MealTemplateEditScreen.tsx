import { useEffect, useState } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { archiveMealTemplate, getFoods, getMealTemplates, reactivateMealTemplate, saveMealTemplate } from "../../db/repositories/nutritionRepository";
import type { Food, Id, MealSlot, MealTemplate, Nutrients } from "../../domain";
import { unitWord } from "../../domain/rules/journalRules";
import {
  editFormOf,
  moveId,
  parseTemplateForm,
  pickerFoods,
  TEMPLATE_DEFAULT_SLOTS,
  type TemplateFormItem,
  type TemplateFormValues,
} from "../../domain/rules/mealTemplateRules";
import { calculateNutrients, formatGrams, formatKcal, MEAL_SLOT_LABELS } from "../../domain/rules/nutritionRules";
import { BodyNav } from "../body/BodyNav";
import "../journal/JournalScreen.css";
import "./foods.css";

const EMPTY: TemplateFormValues = { name: "", defaultSlot: "", items: [] };

/** Le nom de l'unité actuelle d'un aliment, au singulier (« boîte », « g »). */
const currentUnit = (food: Food) => unitWord(1, food.unit, food);

/**
 * Créer ou modifier un repas favori (phase 3A.4b) : nom, repas habituel
 * (aucun ou l'un des quatre repas), aliments de la bibliothèque avec leurs
 * quantités — un aliment une seule fois —, ordre par la poignée ⠿. Un
 * élément d'unité modifiée se corrige ici (quantité ressaisie dans la
 * nouvelle unité) ; un aliment archivé est signalé. Le total en bas est
 * calculé avec les valeurs actuelles, jamais stocké. Archivé : lecture seule.
 */
export function MealTemplateEditScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<MealTemplate | null>();
  const [foods, setFoods] = useState<Food[]>([]);
  const [form, setForm] = useState<TemplateFormValues>(EMPTY);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getMealTemplates({ includeArchived: true }), getFoods({ includeArchived: true })]).then(([templates, library]) => {
      if (cancelled) return;
      const found = id ? templates.find((item) => item.id === id) ?? null : null;
      setFoods(library);
      setTemplate(found);
      if (found) setForm(editFormOf(found, new Map(library.map((food) => [food.id, food]))));
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (template === undefined) return <section className="food-screen"><p>Chargement…</p></section>;
  const back = paths.plusMealTemplates();
  if (id && !template) {
    return (
      <section className="food-screen">
        <BodyNav back={back} backLabel="Favoris" title="Repas favori introuvable" />
      </section>
    );
  }

  const byId = new Map(foods.map((food) => [food.id, food]));
  const readOnly = template?.status === "archived";
  const setItems = (items: TemplateFormItem[]) => setForm({ ...form, items });
  const now = () => new Date().toISOString();

  /* Total indicatif : éléments prêts (ou corrigés) aux quantités saisies, valeurs actuelles des aliments. */
  const totals: Nutrients[] = form.items.flatMap((item) => {
    const food = byId.get(item.foodId);
    const value = Number(item.quantity.trim().replace(",", "."));
    if (!food || food.status !== "active" || !(value > 0)) return [];
    return [calculateNutrients(food, value)];
  });
  const kcal = totals.reduce((sum, item) => sum + item.kcal, 0);
  const protein = totals.length > 0 && totals.every((item) => item.proteinG !== undefined) ? totals.reduce((sum, item) => sum + item.proteinG!, 0) : undefined;

  async function save() {
    const parsed = parseTemplateForm(form, byId);
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    setError(undefined);
    try {
      const stamp = now();
      const existing = await getMealTemplates({ includeArchived: true });
      await saveMealTemplate({
        id: template?.id ?? `meal-${crypto.randomUUID()}`,
        name: parsed.name,
        ...(form.defaultSlot ? { defaultSlot: form.defaultSlot } : {}),
        items: parsed.items,
        position: template?.position ?? existing.reduce((max, item) => Math.max(max, item.position + 1), 0),
        status: "active",
        createdAt: template?.createdAt ?? stamp,
        updatedAt: stamp,
      });
      navigate(back, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = moveId(form.items.map((item) => item.key), String(active.id), String(over.id));
    setItems(keys.map((key) => form.items.find((item) => item.key === key)!));
  }

  function addFood(food: Food) {
    setPicking(false);
    setItems([...form.items, { key: `item-${crypto.randomUUID()}`, foodId: food.id, quantity: String(food.defaultQuantity ?? food.referenceQuantity).replace(".", ","), state: "ready" }]);
  }

  return (
    <section className="food-screen">
      <BodyNav back={back} backLabel="Favoris" title={template ? template.name : "Nouveau repas favori"} />
      {readOnly && <p className="food-screen__note">Repas favori archivé — réactive-le pour le modifier.</p>}

      <div className="food-form">
        <label className="food-form__field">
          <span>Nom</span>
          <input type="text" aria-label="Nom du repas favori" autoComplete="off" placeholder="ex. Déjeuner thon" disabled={readOnly} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="food-form__field">
          <span>Repas habituel</span>
          <select aria-label="Repas habituel" disabled={readOnly} value={form.defaultSlot} onChange={(event) => setForm({ ...form, defaultSlot: event.target.value as MealSlot | "" })}>
            <option value="">Aucun</option>
            {TEMPLATE_DEFAULT_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {MEAL_SLOT_LABELS[slot]}
              </option>
            ))}
          </select>
        </label>

        <h2 className="template-edit__title">Aliments</h2>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={form.items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
            <ul className="template-edit__items" aria-label="Aliments du repas favori">
              {form.items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  food={byId.get(item.foodId)}
                  readOnly={readOnly}
                  onQuantity={(quantity) => setItems(form.items.map((other) => (other.key === item.key ? { ...other, quantity } : other)))}
                  onRemove={() => setItems(form.items.filter((other) => other.key !== item.key))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {!readOnly && (
          <button type="button" className="food-form__button" onClick={() => setPicking(true)}>
            + Ajouter un aliment
          </button>
        )}

        <p className="food-form__preview">{totals.length > 0 ? `= ${formatKcal(kcal)}${protein !== undefined ? ` · ${formatGrams(protein)} protéines` : ""}` : "—"}</p>

        {error && (
          <p className="food-form__error" role="alert">
            {error}
          </p>
        )}
        {readOnly ? (
          <button
            type="button"
            className="food-form__button food-form__button--primary"
            onClick={() => void reactivateMealTemplate(template!.id, now()).then(() => navigate(back, { replace: true }))}
          >
            Réactiver
          </button>
        ) : (
          <>
            <button type="button" className="food-form__button food-form__button--primary" disabled={busy} onClick={() => void save()}>
              Enregistrer
            </button>
            {template && (
              <button
                type="button"
                className="food-form__button food-form__button--quiet"
                onClick={() => void archiveMealTemplate(template.id, now()).then(() => navigate(back, { replace: true }))}
              >
                Archiver ce repas favori
              </button>
            )}
          </>
        )}
      </div>

      {picking && (
        <FoodPicker foods={foods} present={new Set(form.items.map((item) => item.foodId))} onPick={addFood} onDismiss={() => setPicking(false)} />
      )}
    </section>
  );
}

function ItemRow({
  item,
  food,
  readOnly,
  onQuantity,
  onRemove,
}: {
  item: TemplateFormItem;
  food: Food | undefined;
  readOnly: boolean;
  onQuantity: (quantity: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: readOnly });
  const name = food?.name ?? "Aliment introuvable";
  return (
    <li
      ref={setNodeRef}
      className={`template-edit__item${isDragging ? " template-row--dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!readOnly && (
        <button type="button" className="template-row__handle" aria-label={`Déplacer ${name}`} {...attributes} {...listeners}>
          <GripVertical size={18} aria-hidden="true" />
        </button>
      )}
      <span className="template-edit__name">{name}</span>
      <span className="food-form__input template-sheet__quantity">
        <input type="text" inputMode="decimal" autoComplete="off" aria-label={`Quantité : ${name}`} disabled={readOnly} value={item.quantity} onChange={(event) => onQuantity(event.target.value)} />
        <span className="food-form__unit">{food ? currentUnit(food) : ""}</span>
      </span>
      {!readOnly && (
        <button type="button" className="template-edit__remove" aria-label={`Retirer : ${name}`} onClick={onRemove}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
      {item.state === "unit_changed" && food && (
        <span className="template-sheet__note">
          {`Unité modifiée — l'aliment est maintenant en ${currentUnit(food)} : ressaisis la quantité`}
          {item.previous && <span className="template-edit__previous">{`avant : ${item.previous}`}</span>}
        </span>
      )}
      {item.state === "archived" && <span className="template-sheet__note">Archivé — retire-le ou réactive l'aliment dans Plus › Aliments</span>}
    </li>
  );
}

function FoodPicker({ foods, present, onPick, onDismiss }: { foods: Food[]; present: ReadonlySet<Id>; onPick: (food: Food) => void; onDismiss: () => void }) {
  const [query, setQuery] = useState("");
  const choices = pickerFoods(foods, present, query);
  return (
    <BottomSheet title="Ajouter un aliment" actions={[]} dismissLabel="Fermer" onDismiss={onDismiss}>
      <input
        type="search"
        className="food-picker__search"
        aria-label="Rechercher un aliment"
        placeholder="Rechercher un aliment…"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="template-picker">
        {choices.length === 0 && <p className="food-screen__note">Aucun aliment trouvé. Les aliments se créent dans Plus › Aliments.</p>}
        {choices.map(({ food, present: already }) => (
          <button key={food.id} type="button" className="food-row" disabled={already} onClick={() => onPick(food)}>
            <span className="food-row__name">{food.name}</span>
            <span className="food-row__meta">{already ? "Déjà dans ce repas" : `${formatKcal(food.nutrients.kcal)} pour ${food.referenceQuantity} ${currentUnit(food)}`}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
