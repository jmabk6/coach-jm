import { useEffect, useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { addFoodEntry, getFoods, getMealTemplates, recentFoods } from "../../db/repositories/nutritionRepository";
import type { Food, MealSlot, MealTemplate } from "../../domain";
import { searchTemplates, templateLines, templateSections } from "../../domain/rules/mealTemplateRules";
import { addScreenSections, searchFoods } from "../../domain/rules/foodLibraryRules";
import { formatQuantity, parseQuantityInput, resolveJournalDate, unitWord } from "../../domain/rules/journalRules";
import { calculateNutrients, formatGrams, formatKcal } from "../../domain/rules/nutritionRules";
import { BodyNav } from "../body/BodyNav";
import { todayLocalDate } from "../today/useTodayData";
import { EstimateSheet } from "./EstimateSheet";
import { MealTemplateSheet } from "./MealTemplateSheet";
import { ADD_LABELS, mealSlotOf } from "./mealLabels";
import "../foods/foods.css";

/** « 176 kcal pour 1 boîte ». */
function referenceText(food: Food): string {
  return `${formatKcal(food.nutrients.kcal)} pour ${formatQuantity(food.referenceQuantity, food.unit, food)}`;
}

/**
 * Ajouter à un repas (phase 3A.3) : recherche, « + Nouvel aliment »,
 * « + Estimation » (le formulaire de la 3A.2), puis Repas favoris (3A.4a :
 * ceux de ce repas d'abord, les autres repliés), Favoris, Récents (au plus
 * 8, ce repas d'abord) et Autres aliments — chaque aliment une fois.
 * Toucher un aliment ouvre sa quantité, un repas favori sa feuille.
 */
export function AddFoodScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const today = todayLocalDate();
  const { date } = resolveJournalDate(params.get("date"), today);
  const slot = mealSlotOf(params.get("repas"));
  /* Toute la bibliothèque, archivés compris : les repas favoris doivent pouvoir les signaler. */
  const [foods, setFoods] = useState<Food[]>();
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [chosenTemplate, setChosenTemplate] = useState<MealTemplate>();
  const [showOtherTemplates, setShowOtherTemplates] = useState(false);
  const [recents, setRecents] = useState<Food[]>([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Food>();
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (!slot) return;
    let cancelled = false;
    void Promise.all([getFoods({ includeArchived: true }), recentFoods(slot), getMealTemplates()]).then(([loadedFoods, loadedRecents, loadedTemplates]) => {
      if (cancelled) return;
      setFoods(loadedFoods);
      setRecents(loadedRecents);
      setTemplates(loadedTemplates);
    });
    return () => {
      cancelled = true;
    };
  }, [slot]);

  /* Repas inconnu dans l'adresse : retour au Journal. */
  useEffect(() => {
    if (!slot) navigate(paths.journal(date), { replace: true });
  }, [slot, date, navigate]);

  if (!slot) return null;
  const backToJournal = () => navigate(paths.journal(date), { replace: true });
  const searching = query.trim() !== "";
  const sections = foods ? addScreenSections(foods, recents) : undefined;
  const results = foods && searching ? searchFoods(foods, query) : [];
  const foodsById = new Map((foods ?? []).map((food) => [food.id, food]));
  const templateGroups = templateSections(templates, slot);
  const foundTemplates = searching ? searchTemplates(templates, query) : [];

  const templateRows = (label: string, items: MealTemplate[], extra?: React.ReactNode) =>
    (items.length > 0 || extra) && (
      <section className="food-picker__section" aria-label={label}>
        <h2>{label}</h2>
        {items.map((template) => {
          const view = templateLines(template, foodsById);
          const count = template.items.length;
          return (
            <button key={template.id} type="button" className="food-row" onClick={() => setChosenTemplate(template)}>
              <span className="food-row__name">{template.name}</span>
              <span className="food-row__meta">{`${count} aliment${count > 1 ? "s" : ""} · ${formatKcal(view.totals.kcal)}${view.readyCount < count ? " · à vérifier" : ""}`}</span>
              <ChevronRight size={16} className="food-row__chevron" aria-hidden="true" />
            </button>
          );
        })}
        {extra}
      </section>
    );

  const section = (label: string, items: Food[]) =>
    items.length > 0 && (
      <section className="food-picker__section" aria-label={label}>
        <h2>{label}</h2>
        {items.map((food) => (
          <button key={food.id} type="button" className="food-row" onClick={() => setChosen(food)}>
            <span className="food-row__name">
              {food.name}
              {food.favorite && <Star size={13} className="food-row__star" aria-hidden="true" />}
            </span>
            <span className="food-row__meta">{referenceText(food)}</span>
            <ChevronRight size={16} className="food-row__chevron" aria-hidden="true" />
          </button>
        ))}
      </section>
    );

  return (
    <section className="food-screen">
      <BodyNav back={paths.journal(date)} backLabel="Journal" title={ADD_LABELS[slot]} />

      <input
        type="search"
        className="food-picker__search"
        aria-label="Rechercher un aliment ou un repas"
        placeholder="Rechercher un aliment ou un repas…"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="food-picker__actions">
        <Link to={paths.journalNewFood(date, slot, query.trim())} className="food-picker__action">
          + Nouvel aliment
        </Link>
        <button type="button" className="food-picker__action" onClick={() => setEstimating(true)}>
          + Estimation
        </button>
      </div>

      {searching ? (
        <>
          {templateRows("Repas favoris", foundTemplates)}
          {results.length > 0 ? section("Résultats", results) : foundTemplates.length === 0 && <p className="food-screen__note">Aucun aliment trouvé.</p>}
        </>
      ) : (
        sections && (
          <>
            {templateRows(
              "Repas favoris",
              [...templateGroups.primary, ...(showOtherTemplates ? templateGroups.others : [])],
              templateGroups.others.length > 0 && (
                <button type="button" className="food-screen__toggle" aria-expanded={showOtherTemplates} onClick={() => setShowOtherTemplates((open) => !open)}>
                  {showOtherTemplates ? "Masquer les autres repas favoris" : `Autres repas favoris (${templateGroups.others.length})`}
                </button>
              ),
            )}
            {section("Favoris", sections.favorites)}
            {section("Récents", sections.recents)}
            {section("Autres aliments", sections.others)}
            {sections.favorites.length + sections.recents.length + sections.others.length === 0 && (
              <p className="food-screen__note">Ta bibliothèque est vide : crée ton premier aliment.</p>
            )}
          </>
        )
      )}

      {chosen && <QuantitySheet food={chosen} date={date} slot={slot} onDismiss={() => setChosen(undefined)} onAdded={backToJournal} />}
      {chosenTemplate && (
        <MealTemplateSheet template={chosenTemplate} foods={foodsById} date={date} slot={slot} onDismiss={() => setChosenTemplate(undefined)} onAdded={backToJournal} />
      )}
      {estimating && <EstimateSheet date={date} slot={slot} onDismiss={() => setEstimating(false)} onSaved={backToJournal} />}
    </section>
  );
}

const quantityInput = (value: number) => String(value).replace(".", ",");

/** La quantité d'un aliment : préremplie (habituelle, sinon référence), ½, habituelle, ×2, valeurs en direct. */
function QuantitySheet({ food, date, slot, onAdded, onDismiss }: { food: Food; date: string; slot: MealSlot; onAdded: () => void; onDismiss: () => void }) {
  const base = food.defaultQuantity ?? food.referenceQuantity;
  const [text, setText] = useState(quantityInput(base));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const parsed = parseQuantityInput(text);
  const preview = parsed.ok ? calculateNutrients(food, parsed.quantity) : undefined;
  const macro = (value: number | undefined) => (value === undefined ? "—" : formatGrams(value));

  async function add() {
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    try {
      await addFoodEntry({ date, slot, foodId: food.id, quantity: parsed.quantity, now: new Date().toISOString() });
      onAdded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <BottomSheet title={food.name} actions={[{ label: ADD_LABELS[slot], tone: "primary", disabled: busy, onSelect: () => void add() }]} onDismiss={onDismiss}>
      <div className="food-quantity">
        <p className="food-quantity__reference">Référence : {referenceText(food)}</p>
        <label className="food-quantity__field">
          <span>Quantité</span>
          <span className="food-form__input">
            <input type="text" inputMode="decimal" autoComplete="off" aria-label="Quantité à ajouter" value={text} onChange={(event) => setText(event.target.value)} />
            <span className="food-form__unit">{unitWord(parsed.ok ? parsed.quantity : base, food.unit, food)}</span>
          </span>
        </label>
        <div className="food-quantity__shortcuts">
          <button type="button" onClick={() => setText(quantityInput(base / 2))}>
            ½
          </button>
          <button type="button" onClick={() => setText(quantityInput(base))}>
            {food.defaultQuantity !== undefined ? "Habituelle" : "Référence"}
          </button>
          <button type="button" onClick={() => setText(quantityInput(base * 2))}>
            ×2
          </button>
        </div>
        {preview ? (
          <div className="food-quantity__preview">
            <strong>{`${formatKcal(preview.kcal)}${preview.proteinG !== undefined ? ` · ${formatGrams(preview.proteinG)} protéines` : ""}`}</strong>
            {(preview.carbsG !== undefined || preview.fatG !== undefined) && <span>{`${macro(preview.carbsG)} glucides · ${macro(preview.fatG)} lipides`}</span>}
          </div>
        ) : (
          <p className="food-quantity__preview">—</p>
        )}
        {error && (
          <p className="food-form__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
