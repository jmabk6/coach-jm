import type { Exercise, Id, WorkoutSession } from "../../domain";
import { practiceLockOf } from "../../domain/rules/exerciseClearanceRules";
import { hasCompletedEntries } from "./engine/workoutBlocks";

/**
 * Verrou de pratique (lot L2) : une brique dont l'exercice est « À valider »
 * ou « Suspendu » est sautée et verrouillée dès qu'elle entre dans la séance
 * (démarrage, ajout, remplacement). Une brique déjà commencée (une série
 * notée) n'est jamais touchée. Les enfants de groupe ne sont pas concernés
 * (aucun groupe dans le programme ne contient d'exercice à valider).
 */
export function withPracticeLocks(workout: WorkoutSession, exerciseById: ReadonlyMap<Id, Exercise>): WorkoutSession {
  let changed = false;
  const blocks = workout.blocks.map((block) => {
    if (block.kind !== "exercise" || block.locked || block.status === "performed" || hasCompletedEntries(block)) return block;
    const lock = practiceLockOf(exerciseById.get(block.exerciseId));
    if (!lock) return block;
    changed = true;
    return { ...block, status: "skipped" as const, locked: lock };
  });
  if (!changed) return workout;
  const next: WorkoutSession = { ...workout, blocks };
  /* La brique courante verrouillée cède la place : la séance s'ouvrira sur la suivante. */
  const current = blocks.find((block) => block.id === workout.currentBlockId);
  if (current?.kind === "exercise" && current.locked) {
    delete next.currentBlockId;
    delete next.currentEntryId;
  }
  return next;
}
