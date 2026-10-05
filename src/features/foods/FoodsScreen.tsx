import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getFoods, reactivateFood, setFoodFavorite } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { searchFoods } from "../../domain/rules/foodLibraryRules";
import { formatQuantity } from "../../domain/rules/journalRules";
import { formatKcal } from "../../domain/rules/nutritionRules";
import { BodyNav } from "../body/BodyNav";
import "./foods.css";

const referenceText = (food: Food) => `${formatKcal(food.nutrients.kcal)} pour ${formatQuantity(food.referenceQuantity, food.unit, food)}`;

/**
 * Plus › Aliments (phase 3A.3) : la bibliothèque active, par nom ;
 * recherche, favori en un toucher, modification ; les archivés à part,
 * réactivables. Aucun aliment ne se supprime : l'historique les garde.
 */
export function FoodsScreen() {
  const [foods, setFoods] = useState<Food[]>();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getFoods({ includeArchived: true }).then((loaded) => {
      if (!cancelled) setFoods(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = () => setVersion((value) => value + 1);
  const now = () => new Date().toISOString();
  if (!foods) return <section className="food-screen"><p>Chargement…</p></section>;

  const active = searchFoods(foods, query).sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  const archived = foods.filter((food) => food.status === "archived");

  return (
    <section className="food-screen">
      <BodyNav back={paths.plus()} backLabel="Plus" title="Aliments" />
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
        <Link to={paths.plusFoodNew()} className="food-picker__action">
          + Nouvel aliment
        </Link>
      </div>

      {active.length > 0 ? (
        <ul className="food-list" aria-label="Aliments">
          {active.map((food) => (
            <li key={food.id} className="food-list__item">
              <Link to={paths.plusFood(food.id)} className="food-list__link">
                <span className="food-row__name">{food.name}</span>
                <span className="food-row__meta">{referenceText(food)}</span>
              </Link>
              <button
                type="button"
                className={`food-list__star${food.favorite ? " food-list__star--on" : ""}`}
                aria-label={`${food.favorite ? "Retirer des favoris" : "Mettre en favori"} : ${food.name}`}
                aria-pressed={Boolean(food.favorite)}
                onClick={() => void setFoodFavorite(food.id, !food.favorite, now()).then(reload)}
              >
                <Star size={20} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="food-screen__note">{query.trim() ? "Aucun aliment trouvé." : "Aucun aliment pour l'instant."}</p>
      )}

      {archived.length > 0 && (
        <button type="button" className="food-screen__toggle" aria-expanded={showArchived} onClick={() => setShowArchived((open) => !open)}>
          {`Aliments archivés (${archived.length})`}
        </button>
      )}
      {showArchived && archived.length > 0 && (
        <ul className="food-list food-list--archived" aria-label="Aliments archivés">
          {archived.map((food) => (
            <li key={food.id} className="food-list__item">
              <Link to={paths.plusFood(food.id)} className="food-list__link">
                <span className="food-row__name">{food.name}</span>
                <span className="food-row__meta">{referenceText(food)}</span>
              </Link>
              <button type="button" className="food-list__reactivate" aria-label={`Réactiver : ${food.name}`} onClick={() => void reactivateFood(food.id, now()).then(reload)}>
                Réactiver
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
