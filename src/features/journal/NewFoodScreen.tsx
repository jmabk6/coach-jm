import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { createFoodWithEntry, saveFood } from "../../db/repositories/nutritionRepository";
import { emptyFoodForm, foodFromValues } from "../../domain/rules/foodLibraryRules";
import { resolveJournalDate } from "../../domain/rules/journalRules";
import { BodyNav } from "../body/BodyNav";
import { FoodForm } from "../foods/FoodForm";
import { todayLocalDate } from "../today/useTodayData";
import { ADD_LABELS, mealSlotOf } from "./mealLabels";
import "../foods/foods.css";

/**
 * Nouvel aliment depuis un repas (phase 3A.3) : l'aliment entre dans la
 * bibliothèque et s'ajoute aussitôt au repas, en une transaction, puis
 * retour au Journal. « Enregistrer sans ajouter » revient à l'écran Ajouter.
 */
export function NewFoodScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { date } = resolveJournalDate(params.get("date"), todayLocalDate());
  const slot = mealSlotOf(params.get("repas"));

  useEffect(() => {
    if (!slot) navigate(paths.journal(date), { replace: true });
  }, [slot, date, navigate]);
  if (!slot) return null;

  const newFood = (values: Parameters<typeof foodFromValues>[0]) => {
    const now = new Date().toISOString();
    return foodFromValues(values, { id: `food-${crypto.randomUUID()}`, createdAt: now }, now);
  };
  const lower = ADD_LABELS[slot].replace(/^Ajouter /, "");

  return (
    <section className="food-screen">
      <BodyNav back={paths.journalAdd(date, slot)} backLabel="Ajouter" title="Nouvel aliment" />
      <FoodForm
        initial={emptyFoodForm(params.get("nom") ?? "")}
        meal={{ addLabel: `Enregistrer et ajouter ${lower}`, title: ADD_LABELS[slot] }}
        primaryLabel={`Enregistrer et ajouter ${lower}`}
        onPrimary={async (values, quantity) => {
          await createFoodWithEntry(newFood(values), { date, slot, quantity: quantity!, now: new Date().toISOString() });
          navigate(paths.journal(date), { replace: true });
        }}
        secondaryLabel="Enregistrer sans ajouter"
        onSecondary={async (values) => {
          await saveFood(newFood(values));
          navigate(paths.journalAdd(date, slot), { replace: true });
        }}
      />
    </section>
  );
}
