import type { Id } from "./exercise";

export interface WeightEntry {
  id: Id;

  /**
   * Date locale : YYYY-MM-DD
   */
  date: string;

  kg: number;

  createdAt: string;
  updatedAt: string;
}
