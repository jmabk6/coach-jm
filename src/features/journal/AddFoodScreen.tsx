import { useEffect, useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { addFoodEntry, getFoods, recentFoods } from "../../db/repositories/nutritionRepository";
import type { Food, MealSlot } from "../../domain";
import { addScreenSections, searchFoods } from "../../domain/rules/foodLibraryRules";
import { formatQuantity, parseQuantityInput, resolveJournalDate, unitWord } from "../../domain/rules/journalRules";
import { calculateNutrients, formatGrams, formatKcal } from "../../domain/rules/nutritionRules";
import { BodyNav } from "../body/BodyNav";
import { todayLocalDate } from "../today/useTodayData";
import { EstimateSheet } from "./EstimateSheet";
import { ADD_LABELS, mealSlotOf } from "./mealLabels";
import "../foods/foods.css";

/** « 176 kcal pour 1 boîte ». */
function referenceText(food: Food): string {
  return `${formatKcal(food.nutrients.kcal)} pour ${formatQuantity(food.referenceQuantity, food.unit, food)}`;
}

/**
 * Ajouter à un repas (phase 3A.3) : recherche, « + Nouvel aliment »,
 * « + Estimation » (le formulaire de la 3A.2), puis Favoris, Récents (au
 * plus 8, ce repas d'abord) et Autres aliments — chaque aliment une fois.
 * Toucher un aliment ouvre sa quantité, préremplie.
 */
export function AddFoodScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const today = todayLocalDate();
  const { date } = resolveJournalDate(params.get("date"), today);
  const slot = mealSlotOf(params.get("repas"));
  const [foods, setFoods] = useState<Food[]>();
  const [recents, setRecents] = useState<Food[]>([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Food>();
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (!slot) return;
    let cancelled = false;
    void Promise.all([getFoods(), recentFoods(slot)]).then(([loadedFoods, loadedRecents]) => {
      if (cancelled) return;
      setFoods(loadedFoods);
      setRecents(loadedRecents);
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
        aria-label="Rechercher un aliment"
        placeholder="Rechercher un aliment…"
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
        results.length > 0 ? section("Résultats", results) : <p className="food-screen__note">Aucun aliment trouvé.</p>
      ) : (
        sections && (
          <>
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
