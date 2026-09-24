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
import { completeWorkoutSession, endWorkoutSession, isAwaitingConfirmation } from "./engine/workoutEngine";
import { calculateActiveDurationSec } from "./engine/workoutTime";
import { settleTestBlocks } from "../tests/settleTestBlocks";

export { completeWorkoutSession, endWorkoutSession, isAwaitingConfirmation };

/**
 * Durée active d'une séance à l'instant `now` (§12) : amplitude moins
 * pauses pour une séance en cours, valeur figée dès `Terminer` (D20).
 */
export function currentActiveDurationSec(
  workout: WorkoutSession,
  now: string,
): number {
  return workout.status === "completed" || workout.endedAt !== undefined
    ? workout.activeDurationSec
    : calculateActiveDurationSec(workout, now);
}

/** Le sort d'un cadre à la clôture : validé (jalon créé) ou non, avec le motif. */
export interface FrameOutcome {
  frameVersionId: Id;
  result: FrameValidationResult;
  milestoneId?: Id;
}

export interface ConfirmWorkoutResult {
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
 * `Terminer` (D20, D21) : pose `endedAt`, clôt le repos et une pause
 * ouverte, fige la durée active. La séance reste `in_progress` : aucun
 * jalon, aucun figeage, l'instance planifiée reste en cours, et la séance
 * n'entre dans aucune statistique tant qu'elle n'est pas enregistrée.
 */
export async function endWorkout(
  workoutId: Id,
  now: string = new Date().toISOString(),
): Promise<WorkoutSession> {
  return db.transaction("rw", db.workouts, async () => {
    const workout = await getWorkout(workoutId);

    if (!workout) throw new Error("Séance réalisée introuvable");
    if (workout.status !== "in_progress") throw new Error("Cette séance est déjà enregistrée");
    if (workout.endedAt !== undefined) return workout;

    const ended = endWorkoutSession(workout, now);
    await saveWorkout(ended);

    return ended;
  });
}

export interface ConfirmWorkoutInput {
  feeling?: WorkoutSession["feeling"];
  note?: string;
}

/**
 * Ressenti et notes entre Terminer et Enregistrer (M10, D21) : écrits
 * aussitôt sur la séance en attente, pour survivre à une fermeture de
 * l'application. Une note vide efface la note.
 */
export async function saveWorkoutFeedback(
  workoutId: Id,
  input: ConfirmWorkoutInput,
  now: string = new Date().toISOString(),
): Promise<WorkoutSession> {
  return db.transaction("rw", db.workouts, async () => {
    const workout = await getWorkout(workoutId);

    if (!workout) throw new Error("Séance réalisée introuvable");
    if (!isAwaitingConfirmation(workout)) throw new Error("Cette séance est déjà enregistrée");

    const next: WorkoutSession = { ...workout, updatedAt: now };
    if (input.feeling !== undefined) next.feeling = input.feeling;
    if (input.note !== undefined) {
      const note = input.note.trim();
      if (note) next.note = note;
      else delete next.note;
    }

    await saveWorkout(next);
    return next;
  });
}

/**
 * `Enregistrer et revenir à l'accueil` (conception V2 § 2.6) : en **une**
 * transaction, écrit ressenti et notes, passe la séance `completed` avec
 * `completedAt = endedAt`, fige les cadres et crée les jalons, puis passe
 * l'instance planifiée `Faite`. Ensuite la séance ne se modifie plus.
 *
 * Musculation (v1.6, § 4.2 bis, § 4.3, § 4.4) : chaque version de cadre
 * référencée est figée à sa première séance enregistrée
 * (`firstOfficialWorkoutId`) ; chaque version exécutée est validée sur ses
 * séries (hors prescription réduite) : un jalon est créé si tous les
 * critères sont remplis, et l'objectif en cours est effacé. La validation
 * lit la version portée par la brique, jamais la version active du cadre.
 */
export async function confirmWorkout(
  workoutId: Id,
  input: ConfirmWorkoutInput = {},
  now: string = new Date().toISOString(),
): Promise<ConfirmWorkoutResult> {
  return db.transaction(
    "rw",
    [db.workouts, db.plannedSessions, db.strengthFrameVersions, db.strengthMilestones, db.testResults, db.testProtocolVersions],
    async () => {
      const workout = await getWorkout(workoutId);

      if (!workout) {
        throw new Error("Séance réalisée introuvable");
      }

      if (workout.status !== "in_progress") {
        throw new Error("Cette séance est déjà enregistrée");
      }

      if (workout.endedAt === undefined) {
        throw new Error("Terminez d'abord la séance");
      }

      /* Tests (D27) : chaque brique réalisée devient un `TestResult`,
         le brouillon quitte la séance. */
      const completed = await settleTestBlocks(completeWorkoutSession(workout, now, input), now);

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
