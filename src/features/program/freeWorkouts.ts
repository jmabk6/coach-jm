import type { Exercise, Id, SessionCategory, SessionTemplate, WorkoutSession } from "../../domain";
import { isMobilityAssessment } from "../../domain/rules/workoutKindRules";

/**
 * Réalisations libres affichées dans le Programme (décision du 16/09/2026) :
 * une séance faite hors planification apparaît au calendrier comme
 * `Faite · Libre`, sans jamais modifier la règle ni créer d'instance (§10).
 */
export function isFreeWorkoutVisibleInProgram(workout: WorkoutSession): boolean {
  return !workout.plannedSessionId && workout.status === "completed";
}

/**
 * `Tapis + 4 exercices · 52 min`, `Tapis · 35 min`, `5 exercices · 40 min`,
 * résumé du contenu réellement réalisé, jamais des réglages d'un palier.
 */
export function formatFreeWorkoutSummary(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): string {
  const cardioNames: string[] = [];
  let exerciseCount = 0;

  for (const block of workout.blocks) {
    if (block.kind === "note" || block.status !== "performed") continue;

    if (block.kind === "group") {
      exerciseCount += block.children.length;
      continue;
    }

    const exercise = exerciseById.get(block.exerciseId);

    if (exercise?.category === "Cardio") {
      if (!cardioNames.includes(exercise.name)) cardioNames.push(exercise.name);
    } else {
      exerciseCount += 1;
    }
  }

  const parts: string[] = [];

  if (cardioNames.length > 0) parts.push(cardioNames.join(", "));
  if (exerciseCount > 0) {
    parts.push(exerciseCount === 1 ? "1 exercice" : `${exerciseCount} exercices`);
  }

  const content = parts.length > 0 ? parts.join(" + ") : "Aucun exercice";
  const minutes = Math.round(workout.activeDurationSec / 60);

  return `${content} · ${minutes} min`;
}

/**
 * Catégorie dominante pour l'icône de la ligne d'une séance libre : un
 * **bilan de mobilité** d'abord (`kind` prime sur toute inférence, v1.5
 * § 11.4 — l'inférence ne connaît pas « Test mobilité » et classerait un
 * bilan improvisé en Musculation), puis cardio seul → Cardio, mobilité
 * seule → Mobilité, sinon Musculation.
 */
export function inferFreeWorkoutCategory(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): SessionCategory {
  if (isMobilityAssessment(workout)) return "Bilan de mobilité";

  const categories = new Set<string>();

  for (const block of workout.blocks) {
    if (block.kind !== "exercise" || block.status !== "performed") continue;

    const category = exerciseById.get(block.exerciseId)?.category;

    if (category) categories.add(category);
  }

  if (categories.size === 1 && categories.has("Cardio")) return "Cardio";
  if (categories.size === 1 && categories.has("Mobilité")) return "Mobilité";

  return "Musculation";
}

/**
 * Catégorie affichée pour une séance faite, quelle que soit sa source :
 * la nature réelle (`kind`) prime, puis la catégorie du modèle, puis
 * l'inférence sur le contenu pour une séance libre sans modèle.
 */
export function categoryForWorkout(
  workout: WorkoutSession,
  template: SessionTemplate | undefined,
  exerciseById: Map<Id, Exercise>,
): SessionCategory {
  if (isMobilityAssessment(workout)) return "Bilan de mobilité";

  return template?.category ?? inferFreeWorkoutCategory(workout, exerciseById);
}
