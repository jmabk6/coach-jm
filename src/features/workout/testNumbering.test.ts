import { describe, expect, it } from "vitest";
import type { PerformedBlock } from "../../domain";
import { calculatePerformedNumbering } from "./workoutDisplay";

/** Le test est l'étape 0 seulement quand il ouvre la séance (03/10/2026). */

const exercise = (id: string, position: number, role?: "warmup") => ({ id, kind: "exercise", position, ...(role ? { role } : {}) }) as unknown as PerformedBlock;
const test = (id: string, position: number) => ({ id, kind: "test", position }) as unknown as PerformedBlock;

describe("numérotation de la frise", () => {
  it("test en tête après l'échauffement : 0, puis 1 à N", () => {
    expect(calculatePerformedNumbering([exercise("w", 0, "warmup"), test("t", 1), exercise("a", 2), exercise("b", 3)])).toEqual({ t: 0, a: 1, b: 2 });
  });

  it("test après la suspension (Muscu C) : sans numéro, les exercices de 1 à N", () => {
    expect(calculatePerformedNumbering([exercise("w", 0, "warmup"), exercise("s", 1), test("t", 2), exercise("m", 3)])).toEqual({ s: 1, m: 2 });
  });
});
