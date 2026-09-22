import { getActiveRpeScaleVersion } from "../../db/repositories/rpeScaleRepository";
import {
  getInProgressWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type { SessionTemplate, WorkoutKind, WorkoutSession } from "../../domain";
import { kindForCategory } from "../../domain/rules/workoutKindRules";
import { loadActiveFrameVersions } from "../strength/activeFrameVersions";
import { createWorkoutSnapshot } from "./createWorkoutSnapshot";

export interface StartFreeWorkoutOptions {
  /**
   * Nature d'une séance libre **sans modèle** (v1.5, § 2.2) : le choix
   * explicite « Bilan de mobilité » de la feuille d'Aujourd'hui. Ignorée
   * quand un modèle est fourni : sa catégorie décide.
   */
  kind?: WorkoutKind;
}

/**
 * Démarre une réalisation libre (§10) : sans modèle, la séance part vide
 * et se construit exercice par exercice ; avec un modèle (séance
 * supplémentaire, ou modèle sans planifiée aujourd'hui), les consignes
 * sont copiées comme pour une planifiée. Dans les deux cas, aucune
 * instance n'est créée : le Programme ne bouge pas.
 */
export async function startFreeWorkout(
  date: string,
  now: string = new Date().toISOString(),
  template?: SessionTemplate,
  options: StartFreeWorkoutOptions = {},
): Promise<WorkoutSession> {
  const inProgressWorkout =
    await getInProgressWorkout();

  if (inProgressWorkout) {
    throw new Error(
      "Une séance est déjà en cours",
    );
  }

  /* Échelle de RPE et versions de cadre actives, capturées au démarrage (v1.6, § 4.3, § 4.5). */
  const [rpeScale, frames] = await Promise.all([getActiveRpeScaleVersion(), loadActiveFrameVersions()]);

  const workout: WorkoutSession = {
    id: `free-${date}-${now}`,
    ...(template ? { sessionTemplateId: template.id } : {}),
    kind: template ? kindForCategory(template.category) : (options.kind ?? "training"),
    ...(rpeScale ? { rpeScaleVersionId: rpeScale.id } : {}),
    source: "free",
    status: "in_progress",
    date,
    startedAt: now,
    lastActionAt: now,
    activeDurationSec: 0,
    blocks: template ? createWorkoutSnapshot(template, frames.versionIdByExercise) : [],
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkout(workout);

  return workout;
}
