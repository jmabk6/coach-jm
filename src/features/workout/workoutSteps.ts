import type { Exercise, Id, PerformedBlock } from "../../domain";

export type StepState = "done" | "current" | "skipped" | "upcoming";

export interface Step {
  id: Id;
  number: number;
  label: string;
  state: StepState;
}

/**
 * Étapes de la frise (M9, lot M.3) : chaque brique hors note, dans
 * l'ordre ; la brique test est l'étape 0. Faite, courante, sautée ou à
 * venir.
 */
export function workoutSteps(
  blocks: ReadonlyArray<PerformedBlock>,
  numbering: Partial<Record<Id, number>>,
  currentBlockId: Id | undefined,
  exerciseById: ReadonlyMap<Id, Exercise>,
): Step[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .flatMap((block): Step[] => {
      if (block.kind === "note") return [];
      const label =
        block.kind === "test"
          ? "Test"
          : block.kind === "group"
            ? block.name?.trim() || "Groupe"
            : (exerciseById.get(block.exerciseId)?.name ?? "Exercice");
      const state: StepState =
        block.status === "performed"
          ? "done"
          : block.status === "skipped"
            ? "skipped"
            : block.id === currentBlockId
              ? "current"
              : "upcoming";
      return [{ id: block.id, number: numbering[block.id] ?? 0, label, state }];
    });
}
