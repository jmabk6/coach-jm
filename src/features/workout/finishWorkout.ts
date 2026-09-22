import { db } from "../../db/database";
import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import {
  getWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type { Id, StrengthFrameVersion, StrengthMilestone, WorkoutSession } from "../../domain";
import {
  frameVersionIdsOf,
  seriesByFrameVersion,
  validateFrame,
  type FrameValidationResult,
} from "../../domain/rules/strengthRules";
import { isMobilityAssessment } from "../../domain/rules/workoutKindRules";
import { completeWorkoutSession } from "./engine/workoutEngine";
import { calculateActiveDurationSec } from "./engine/workoutTime";

export { completeWorkoutSession };

/**
 * Durée active d'une séance à l'instant `now` (§12) : amplitude moins
 * pauses pour une séance en cours, valeur figée pour une séance terminée.
 */
export function currentActiveDurationSec(
  workout: WorkoutSession,
  now: string,
): number {
  return workout.status === "completed"
    ? workout.activeDurationSec
    : calculateActiveDurationSec(workout, now);
}

/** Le sort d'un cadre à la clôture : validé (jalon créé) ou non, avec le motif. */
export interface FrameOutcome {
  frameVersionId: Id;
  result: FrameValidationResult;
  milestoneId?: Id;
}

export interface FinishWorkoutResult {
  workout: WorkoutSession;
  /** Un élément par version de cadre exécutée dans la séance ; vide hors musculation cadrée. */
  frames: FrameOutcome[];
}

/** Identifiant déterministe : une clôture ne crée jamais deux jalons pour la même version. */
export function milestoneIdFor(workoutId: Id, frameVersionId: Id): Id {
  return `milestone-${workoutId}-${frameVersionId}`;
}

/**
 * Les séances importées (`import-*`) ne passent pas par ici ; par sécurité,
 * elles et les bilans de mobilité ne produisent jamais de jalon ni de
 * figeage (conception v1.6, § 4.3).
 */
function framesApply(workout: WorkoutSession): boolean {
  return !workout.id.startsWith("import-") && !isMobilityAssessment(workout);
}

/**
 * Termine la séance en cours (`Terminer` comme `Arrêter`, §14 et §15) et,
 * si elle était planifiée, passe l'instance `Faite`. Une séance libre
 * ne touche pas au Programme.
 *
 * Musculation (v1.6, § 4.2 bis, § 4.3, § 4.4) — dans la **même
 * transaction** que la séance :
 * - chaque version de cadre référencée par une brique ou un tour est
 *   figée à sa première séance terminée (`firstOfficialWorkoutId`) ;
 * - chaque version exécutée est validée sur ses séries : un jalon est
 *   créé si tous les critères sont remplis, et l'objectif en cours de la
 *   version est effacé (événement 4 du cycle de vie).
 * La validation lit la version portée par la brique, jamais la version
 * active du cadre.
 */
export async function finishWorkout(
  workoutId: Id,
  now: string = new Date().toISOString(),
): Promise<FinishWorkoutResult> {
  return db.transaction(
    "rw",
    [db.workouts, db.plannedSessions, db.strengthFrameVersions, db.strengthMilestones],
    async () => {
      const workout = await getWorkout(workoutId);

      if (!workout) {
        throw new Error("Séance réalisée introuvable");
      }

      if (workout.status !== "in_progress") {
        throw new Error("Cette séance est déjà terminée");
      }

      const completed = completeWorkoutSession(workout, now);

      await saveWorkout(completed);

      if (workout.plannedSessionId) {
        const plannedSession = await getPlannedSession(workout.plannedSessionId);

        if (plannedSession) {
          await savePlannedSession({
            ...plannedSession,
            status: "done",
            workoutId: completed.id,
            updatedAt: now,
          });
        }
      }

      const frames = framesApply(completed) ? await settleFrames(completed, now) : [];

      return { workout: completed, frames };
    },
  );
}

async function settleFrames(workout: WorkoutSession, now: string): Promise<FrameOutcome[]> {
  const referenced = frameVersionIdsOf(workout);
  const executed = seriesByFrameVersion(workout);
  const outcomes: FrameOutcome[] = [];

  for (const versionId of referenced) {
    const version = await db.strengthFrameVersions.get(versionId);

    /* Version disparue (cadre supprimé pendant la séance) : rien à figer, rien à valider. */
    if (!version) continue;

    const next: StrengthFrameVersion = { ...version };
    let changed = false;

    if (next.firstOfficialWorkoutId === undefined) {
      next.firstOfficialWorkoutId = workout.id;
      next.frozenAt = now;
      changed = true;
    }

    const series = executed.get(versionId);

    if (series) {
      const result = validateFrame(version, series);
      const outcome: FrameOutcome = { frameVersionId: versionId, result };

      if (result.validated) {
        const milestone: StrengthMilestone = {
          id: milestoneIdFor(workout.id, versionId),
          frameVersionId: versionId,
          workoutId: workout.id,
          date: workout.date,
          value: result.value,
          unit: result.unit,
          ...(result.ceilingReached ? { ceilingReached: true } : {}),
          createdAt: now,
        };

        await db.strengthMilestones.put(milestone);
        outcome.milestoneId = milestone.id;

        /* Le fait nouveau remplace le conseil accepté (§ 4.2 bis, événement 4). */
        if (next.currentTarget !== undefined) {
          delete next.currentTarget;
          changed = true;
        }
      }

      outcomes.push(outcome);
    }

    if (changed) {
      next.updatedAt = now;
      await db.strengthFrameVersions.put(next);
    }
  }

  return outcomes;
}
