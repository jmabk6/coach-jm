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

  createdAt: string;
  updatedAt: string;
}
