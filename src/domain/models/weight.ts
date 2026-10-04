import type { Id } from "./exercise";

export interface WeightEntry {
  id: Id;

  /**
   * Date locale : YYYY-MM-DD
   */
  date: string;

  kg: number;

  /**
   * Composition corporelle estimée par la balance (26/09/2026) : champs
   * FACULTATIFS, sans migration — les pesées et les sauvegardes d'avant
   * n'en ont pas. Masse grasse en %, masse musculaire en kg, une décimale.
   * Jamais dans un calcul de statut.
   */
  fatPct?: number;
  muscleKg?: number;

  /**
   * Pesée synchronisée depuis la mesure corporelle de référence du jour
   * (`bodyMeasurements`, première mesure du jour, 05/10/2026) : son poids
   * est celui de la mesure et ne se corrige pas à la main. Absent : pesée
   * saisie à la main. `fatPct` et `muscleKg` ci-dessus restent les relevés
   * de la Withings (avant le 05/10/2026), jamais ceux de la RENPHO.
   */
  bodyMeasurementId?: Id;

  createdAt: string;
  updatedAt: string;
}
