import { db } from "../database";
import type { Food, FoodLogEntry, Id, MealSlot, MealTemplate, Nutrients } from "../../domain";
import {
  dayState,
  dayTotals,
  entryFromFood,
  estimatedExtraEntry,
  foodError,
  MEAL_SLOTS,
  nutrientsError,
  quantityError,
  withQuantity,
  type DayTotals,
  type NutritionDayState,
} from "../../domain/rules/nutritionRules";
import { groupKeyOf, redistributeQuantity } from "../../domain/rules/entryGroupRules";

/**
 * Alimentation (phase 3A.1, 05/10/2026) — aliments, repas favoris, journal
 * et journées. Les règles (calcul depuis la base figée, validation, états
 * de la journée) sont dans `nutritionRules` ; ici, seulement la lecture et
 * l'écriture. Une saisie refusée lève une `Error` au message affichable.
 */

export const FOOD_IN_USE_MESSAGE = "Aliment utilisé par le journal ou un repas favori : archivez-le plutôt que de le supprimer.";
export const EMPTY_DAY_MESSAGE = "Une journée sans aucune saisie ne peut pas être déclarée complète.";
export const GROUP_CHANGED_MESSAGE = "Le journal a changé : réessaie.";

type NewId = () => Id;
const randomId: NewId = () => crypto.randomUUID();

const byName = (a: Food, b: Food) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

/* ——— Aliments ——— */

/** La bibliothèque, triée par nom ; sans les archivés, sauf demande. */
export async function getFoods(options: { includeArchived?: boolean } = {}): Promise<Food[]> {
  const foods = await db.foods.toArray();
  return foods.filter((food) => options.includeArchived || food.status === "active").sort(byName);
}

export async function getFood(id: Id): Promise<Food | undefined> {
  return db.foods.get(id);
}

/** Crée ou remplace un aliment validé. Les lignes du journal déjà saisies ne changent jamais. */
export async function saveFood(food: Food): Promise<void> {
  const error = foodError(food);
  if (error) throw new Error(error);
  await db.foods.put({ ...food, name: food.name.trim() });
}

export async function setFoodFavorite(id: Id, favorite: boolean, now: string): Promise<void> {
  await db.transaction("rw", db.foods, async () => {
    const food = await db.foods.get(id);
    if (!food) throw new Error("Aliment introuvable");
    const next: Food = { ...food, updatedAt: now };
    if (favorite) next.favorite = true;
    else delete next.favorite;
    await db.foods.put(next);
  });
}

export async function archiveFood(id: Id, now: string): Promise<void> {
  await db.transaction("rw", db.foods, async () => {
    const food = await db.foods.get(id);
    if (!food) throw new Error("Aliment introuvable");
    await db.foods.put({ ...food, status: "archived", updatedAt: now });
  });
}

export async function reactivateFood(id: Id, now: string): Promise<void> {
  await db.transaction("rw", db.foods, async () => {
    const food = await db.foods.get(id);
    if (!food) throw new Error("Aliment introuvable");
    await db.foods.put({ ...food, status: "active", updatedAt: now });
  });
}

/** Supprime un aliment jamais utilisé ; sinon refus : on l'archive. */
export async function deleteFood(id: Id): Promise<void> {
  await db.transaction("rw", db.foods, db.foodLogEntries, db.mealTemplates, async () => {
    const used =
      (await db.foodLogEntries.where("foodId").equals(id).count()) > 0 ||
      (await db.mealTemplates.toArray()).some((template) => template.items.some((item) => item.foodId === id));
    if (used) throw new Error(FOOD_IN_USE_MESSAGE);
    await db.foods.delete(id);
  });
}

/* ——— Repas favoris ——— */

export async function getMealTemplates(options: { includeArchived?: boolean } = {}): Promise<MealTemplate[]> {
  const templates = await db.mealTemplates.orderBy("position").toArray();
  return templates.filter((template) => options.includeArchived || template.status === "active");
}

/** Crée ou remplace un repas favori : un nom, au moins un aliment connu, des quantités valides. */
export async function saveMealTemplate(template: MealTemplate): Promise<void> {
  if (template.name.trim() === "") throw new Error("Nom du repas : obligatoire.");
  if (template.items.length === 0) throw new Error("Repas favori : au moins un aliment.");
  await db.transaction("rw", db.mealTemplates, db.foods, async () => {
    for (const item of template.items) {
      if (!(await db.foods.get(item.foodId))) throw new Error(`Aliment introuvable : ${item.foodId}`);
      const error = quantityError(item.quantity);
      if (error) throw new Error(error);
    }
    await db.mealTemplates.put({ ...template, name: template.name.trim() });
  });
}

export async function archiveMealTemplate(id: Id, now: string): Promise<void> {
  await db.transaction("rw", db.mealTemplates, async () => {
    const template = await db.mealTemplates.get(id);
    if (!template) throw new Error("Repas favori introuvable");
    await db.mealTemplates.put({ ...template, status: "archived", updatedAt: now });
  });
}

/* ——— Journal ——— */

const slotRank = (slot: MealSlot) => MEAL_SLOTS.indexOf(slot);

/** Les lignes d'un jour, dans l'ordre des repas, puis de saisie. */
export async function getDayEntries(date: string): Promise<FoodLogEntry[]> {
  const entries = await db.foodLogEntries.where("date").equals(date).toArray();
  return entries.sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export interface AddFoodEntryInput {
  date: string;
  slot: MealSlot;
  foodId: Id;
  quantity: number;
  now: string;
}

/** Ajoute un aliment au journal : sa base est copiée maintenant et ne changera plus. */
export async function addFoodEntry(input: AddFoodEntryInput, newId: NewId = randomId): Promise<FoodLogEntry> {
  const error = quantityError(input.quantity);
  if (error) throw new Error(error);
  return db.transaction("rw", db.foods, db.foodLogEntries, async () => {
    const food = await db.foods.get(input.foodId);
    if (!food) throw new Error("Aliment introuvable");
    const entry = entryFromFood(food, { id: `log-${newId()}`, date: input.date, slot: input.slot, quantity: input.quantity, now: input.now });
    await db.foodLogEntries.add(entry);
    return entry;
  });
}

/**
 * Nouvel aliment ajouté aussitôt au repas (phase 3A.3) : l'aliment et sa
 * ligne dans une seule transaction — les deux, ou rien.
 */
export async function createFoodWithEntry(
  food: Food,
  input: Omit<AddFoodEntryInput, "foodId">,
  newId: NewId = randomId,
): Promise<FoodLogEntry> {
  const foodProblem = foodError(food);
  if (foodProblem) throw new Error(foodProblem);
  const quantityProblem = quantityError(input.quantity);
  if (quantityProblem) throw new Error(quantityProblem);
  return db.transaction("rw", db.foods, db.foodLogEntries, async () => {
    const saved: Food = { ...food, name: food.name.trim() };
    await db.foods.put(saved);
    const entry = entryFromFood(saved, { id: `log-${newId()}`, date: input.date, slot: input.slot, quantity: input.quantity, now: input.now });
    await db.foodLogEntries.add(entry);
    return entry;
  });
}

export interface AddMealTemplateInput {
  date: string;
  slot: MealSlot;
  mealTemplateId: Id;
  /** Quantités ajustées pour ce jour, par élément du favori. */
  quantities?: Record<Id, number>;
  /** Éléments retirés pour ce jour. */
  excluded?: Id[];
  now: string;
}

/** Ajoute un repas favori : une ligne par aliment, chacune avec sa base, regroupées. Le favori ne change pas. */
export async function addMealTemplateEntries(input: AddMealTemplateInput, newId: NewId = randomId): Promise<FoodLogEntry[]> {
  return db.transaction("rw", db.foods, db.mealTemplates, db.foodLogEntries, async () => {
    const template = await db.mealTemplates.get(input.mealTemplateId);
    if (!template) throw new Error("Repas favori introuvable");
    const items = template.items.filter((item) => !input.excluded?.includes(item.id));
    if (items.length === 0) throw new Error("Repas favori : au moins un aliment.");
    const groupId = `group-${newId()}`;
    const entries: FoodLogEntry[] = [];
    for (const item of items) {
      const quantity = input.quantities?.[item.id] ?? item.quantity;
      const error = quantityError(quantity);
      if (error) throw new Error(error);
      const food = await db.foods.get(item.foodId);
      if (!food) throw new Error("Aliment introuvable");
      entries.push(entryFromFood(food, { id: `log-${newId()}`, date: input.date, slot: input.slot, quantity, now: input.now, groupId, mealTemplateId: template.id }));
    }
    await db.foodLogEntries.bulkAdd(entries);
    return entries;
  });
}

export interface AddEstimatedExtraInput {
  date: string;
  slot?: MealSlot;
  name?: string;
  nutrients: Nutrients;
  now: string;
}

/** Un extra estimé : kcal obligatoires (> 0), macros facultatives, marqué « estimé ». */
export async function addEstimatedExtra(input: AddEstimatedExtraInput, newId: NewId = randomId): Promise<FoodLogEntry> {
  if (!(input.nutrients.kcal > 0)) throw new Error("Calories estimées : supérieures à 0.");
  const error = nutrientsError(input.nutrients);
  if (error) throw new Error(error);
  const entry = estimatedExtraEntry({ id: `log-${newId()}`, ...input });
  await db.foodLogEntries.add(entry);
  return entry;
}

/** Change la quantité d'une ligne : recalcul depuis sa base figée, jamais depuis ses valeurs précédentes. */
export async function updateEntryQuantity(id: Id, quantity: number, now: string): Promise<FoodLogEntry> {
  const error = quantityError(quantity);
  if (error) throw new Error(error);
  return db.transaction("rw", db.foodLogEntries, async () => {
    const entry = await db.foodLogEntries.get(id);
    if (!entry) throw new Error("Ligne introuvable");
    const next = withQuantity(entry, quantity, now);
    await db.foodLogEntries.put(next);
    return next;
  });
}

/** Supprime une ligne ; si c'était la dernière du jour, la journée redevient « non renseignée » (déclaration effacée). */
export async function deleteEntry(id: Id): Promise<void> {
  await db.transaction("rw", db.foodLogEntries, db.nutritionDays, async () => {
    const entry = await db.foodLogEntries.get(id);
    if (!entry) throw new Error("Ligne introuvable");
    await db.foodLogEntries.delete(id);
    if ((await db.foodLogEntries.where("date").equals(entry.date).count()) === 0) await db.nutritionDays.delete(entry.date);
  });
}

/**
 * Relit les lignes d'un groupe affiché, dans la transaction : toutes encore
 * là et toujours compatibles entre elles, sinon refus sans rien écrire.
 */
async function readGroup(ids: readonly Id[]): Promise<FoodLogEntry[]> {
  if (ids.length === 0) throw new Error(GROUP_CHANGED_MESSAGE);
  const entries = await db.foodLogEntries.bulkGet([...ids]);
  if (entries.some((entry) => entry === undefined)) throw new Error(GROUP_CHANGED_MESSAGE);
  const found = entries as FoodLogEntry[];
  if (found.length > 1) {
    const key = groupKeyOf(found[0]!);
    if (key === undefined || found.some((entry) => groupKeyOf(entry) !== key)) throw new Error(GROUP_CHANGED_MESSAGE);
  }
  return found;
}

/**
 * Nouvelle quantité totale d'un groupe (regroupement visuel) : de la saisie
 * la plus récente vers la plus ancienne ; chaque ligne modifiée se
 * recalcule depuis sa propre base, une ligne tombée à 0 est supprimée. Les
 * autres lignes, les IDs et les provenances ne changent pas.
 */
export async function updateGroupQuantity(ids: readonly Id[], total: number, now: string): Promise<void> {
  const error = quantityError(total);
  if (error) throw new Error(error);
  await db.transaction("rw", db.foodLogEntries, async () => {
    const entries = await readGroup(ids);
    const plan = redistributeQuantity(entries, total);
    for (const entry of entries) {
      const quantity = plan.quantities[entry.id];
      if (quantity !== undefined) await db.foodLogEntries.put(withQuantity(entry, quantity, now));
    }
    if (plan.deleted.length > 0) await db.foodLogEntries.bulkDelete(plan.deleted);
  });
}

/** Supprime toutes les lignes d'un groupe ; si le jour devient vide, il redevient « non renseigné ». */
export async function deleteEntries(ids: readonly Id[]): Promise<void> {
  await db.transaction("rw", db.foodLogEntries, db.nutritionDays, async () => {
    const entries = await readGroup(ids);
    await db.foodLogEntries.bulkDelete(entries.map((entry) => entry.id));
    const dates = new Set(entries.map((entry) => entry.date));
    for (const date of dates) {
      if ((await db.foodLogEntries.where("date").equals(date).count()) === 0) await db.nutritionDays.delete(date);
    }
  });
}

/**
 * Les aliments récents pour un repas : d'abord ceux mangés à ce repas, puis
 * les autres, du plus récent au plus ancien, sans doublon ni archivé.
 */
export async function recentFoods(slot: MealSlot, limit = 20): Promise<Food[]> {
  const [entries, foods] = await Promise.all([db.foodLogEntries.toArray(), db.foods.toArray()]);
  const active = new Map(foods.filter((food) => food.status === "active").map((food) => [food.id, food]));
  const newestFirst = entries
    .filter((entry) => entry.foodId !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const ordered = [...newestFirst.filter((entry) => entry.slot === slot), ...newestFirst.filter((entry) => entry.slot !== slot)];
  const seen = new Set<Id>();
  const result: Food[] = [];
  for (const entry of ordered) {
    const food = active.get(entry.foodId!);
    if (!food || seen.has(food.id)) continue;
    seen.add(food.id);
    result.push(food);
    if (result.length >= limit) break;
  }
  return result;
}

/* ——— Journées ——— */

/** Déclare (ou retire) la journée complète. Jamais pour une journée sans saisie. */
export async function setDayComplete(date: string, complete: boolean, now: string): Promise<void> {
  await db.transaction("rw", db.foodLogEntries, db.nutritionDays, async () => {
    if (complete && (await db.foodLogEntries.where("date").equals(date).count()) === 0) throw new Error(EMPTY_DAY_MESSAGE);
    await db.nutritionDays.put({ date, complete, updatedAt: now });
  });
}

export type DaySummary =
  | { date: string; state: Extract<NutritionDayState, "unrecorded">; entries: [] }
  | { date: string; state: Exclude<NutritionDayState, "unrecorded">; entries: FoodLogEntry[]; totals: DayTotals };

/** La journée : ses lignes, son état, ses totaux en pleine précision (aucun total pour une journée vide). */
export async function getDaySummary(date: string): Promise<DaySummary> {
  const [entries, day] = await Promise.all([getDayEntries(date), db.nutritionDays.get(date)]);
  const state = dayState(entries, day);
  const totals = dayTotals(entries);
  if (state === "unrecorded" || !totals) return { date, state: "unrecorded", entries: [] };
  return { date, state, entries, totals };
}
