import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { archiveFood, getFood, reactivateFood, saveFood } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { emptyFoodForm, foodFormOf, foodFromValues } from "../../domain/rules/foodLibraryRules";
import { BodyNav } from "../body/BodyNav";
import { FoodForm } from "./FoodForm";
import "./foods.css";

/**
 * Créer ou modifier un aliment depuis Plus › Aliments (phase 3A.3) : le
 * formulaire du Journal, sans la partie « ajouter au repas ». Modifier
 * un aliment ne change jamais les lignes déjà au journal ; archiver le
 * retire des propositions, sans rien effacer.
 */
export function FoodEditScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  /* Création (sans identifiant) : rien à charger. */
  const [food, setFood] = useState<Food | null | undefined>(id ? undefined : null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getFood(id).then((loaded) => {
      if (!cancelled) setFood(loaded ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (food === undefined) return <section className="food-screen"><p>Chargement…</p></section>;
  if (id && !food) {
    return (
      <section className="food-screen">
        <BodyNav back={paths.plusFoods()} backLabel="Aliments" title="Aliment introuvable" />
      </section>
    );
  }
  const backToList = () => navigate(paths.plusFoods(), { replace: true });
  const now = () => new Date().toISOString();

  return (
    <section className="food-screen">
      <BodyNav back={paths.plusFoods()} backLabel="Aliments" title={food ? "Modifier l'aliment" : "Nouvel aliment"} />
      <FoodForm
        initial={food ? foodFormOf(food) : emptyFoodForm("")}
        primaryLabel="Enregistrer"
        onPrimary={async (values) => {
          const stamp = now();
          const base = food ? { id: food.id, createdAt: food.createdAt, status: food.status } : { id: `food-${crypto.randomUUID()}`, createdAt: stamp };
          await saveFood(foodFromValues(values, base, stamp));
          backToList();
        }}
      />
      {food && (
        <button
          type="button"
          className="food-form__button food-form__button--quiet"
          onClick={() => void (food.status === "active" ? archiveFood(food.id, now()) : reactivateFood(food.id, now())).then(backToList)}
        >
          {food.status === "active" ? "Archiver" : "Réactiver"}
        </button>
      )}
      {food?.status === "active" && <p className="food-screen__note">Archivé, il n'est plus proposé à l'ajout ; ton historique le garde.</p>}
    </section>
  );
}
