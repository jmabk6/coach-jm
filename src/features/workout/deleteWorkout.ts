import { db } from "../../db/database";
import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import {
  deleteWorkoutRecord,
  getWorkout,
  getWorkoutsByPlannedSession,
} from "../../db/repositories/workoutRepository";
import type { Id, PlannedSession, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { frameVersionIdsOf } from "../../domain/rules/strengthRules";

export interface DeleteWorkoutResult {
  deletedId: Id;
  /**
   * État de l'instance planifiée après la suppression, si la séance y
   * était rattachée : `À venir` de nouveau, ou toujours `Faite` parce
   * qu'une autre réalisation lui reste rattachée.
   */
  plannedSession?: PlannedSession;
  /** Jalons de musculation retirés avec la séance (v1.6, décision 11). */
  removedMilestones: number;
  /** Versions de cadre redevenues modifiables : plus aucune séance ne les référence. */
  unfrozenVersionIds: Id[];
}

/**
 * Supprime une séance réalisée (§14, v2.9) : la seule suppression d'une
 * réalisation, depuis son récapitulatif, derrière une confirmation.
 * Rien d'autre n'est touché — ni le modèle, ni les autres séances ;
 * l'historique, la progression et `Dernière fois` se recalculent sur ce
 * qui reste, car rien n'est mis en cache. Une séance en cours ne se
 * supprime pas : elle se termine ou s'arrête.
 *
 * Musculation (v1.6, § 4.2 bis, § 10.2, décision 11) — dans la **même
 * transaction** que la séance : ses jalons disparaissent avec elle ; une
 * version de cadre que plus aucune séance terminée ne référence
 * redevient modifiable ; un objectif en cours issu d'un jalon supprimé
 * est effacé (événement 7).
 */
export async function deleteWorkout(
  workoutId: Id,
  now: string = new Date().toISOString(),
): Promise<DeleteWorkoutResult> {
  return db.transaction(
    "rw",
    [db.workouts, db.plannedSessions, db.strengthMilestones, db.strengthFrameVersions],
    async () => {
      const workout = await getWorkout(workoutId);

      if (!workout) {
        throw new Error("Séance réalisée introuvable");
      }

      /* N6 : une séance terminée mais pas encore enregistrée se supprime
         aussi ; une séance vraiment en cours, non : on la termine d'abord. */
      if (workout.status !== "completed" && workout.endedAt === undefined) {
        throw new Error("Une séance en cours ne se supprime pas : terminez-la ou arrêtez-la");
      }

      await deleteWorkoutRecord(workoutId);

      const removed = await db.strengthMilestones.where("workoutId").equals(workoutId).toArray();
      await db.strengthMilestones.where("workoutId").equals(workoutId).delete();

      const unfrozenVersionIds = await releaseFrameVersions(
        workout,
        new Set(removed.map((milestone) => milestone.id)),
        now,
      );

      const base = { deletedId: workoutId, removedMilestones: removed.length, unfrozenVersionIds };

      if (!workout.plannedSessionId) {
        return base;
      }

      const plannedSession = await getPlannedSession(workout.plannedSessionId);

      if (!plannedSession) {
        return base;
      }

      /* D'autres réalisations rattachées à la même instance ? La plus
         récente devient sa référence ; sinon l'instance redevient À venir. */
      const remaining = (await getWorkoutsByPlannedSession(plannedSession.id))
        .filter((item) => item.status === "completed")
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      const next: PlannedSession = remaining[0]
        ? { ...plannedSession, status: "done", workoutId: remaining[0].id, updatedAt: now }
        : (() => {
            const reset: PlannedSession = { ...plannedSession, status: "upcoming", updatedAt: now };
            delete reset.workoutId;
            return reset;
          })();

      await savePlannedSession(next);

      return { ...base, plannedSession: next };
    },
  );
}

/**
 * Après la suppression : pour chaque version que la séance référençait,
 * recalcule le figeage sur les séances terminées restantes. Plus aucune
 * référence → `firstOfficialWorkoutId` et `frozenAt` effacés ; la
 * première séance restante devient la référence si c'était la séance
 * supprimée. Un objectif en cours issu d'un jalon retiré disparaît.
 */
async function releaseFrameVersions(
  deleted: WorkoutSession,
  removedMilestoneIds: Set<Id>,
  now: string,
): Promise<Id[]> {
  const referenced = frameVersionIdsOf(deleted);
  const unfrozen: Id[] = [];

  if (referenced.size === 0 && removedMilestoneIds.size === 0) return unfrozen;

  const remainingCompleted = (await db.workouts.where("status").equals("completed").toArray()).sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt),
  );
  const versionIds = new Set(referenced);

  /* Un objectif peut venir d'un jalon d'une version que la séance ne
     référence plus (cas théorique) : on inspecte aussi ces versions. */
  for (const version of await db.strengthFrameVersions.toArray()) {
    const from = version.currentTarget?.fromMilestoneId;
    if (from !== undefined && removedMilestoneIds.has(from)) versionIds.add(version.id);
  }

  for (const versionId of versionIds) {
    const version = await db.strengthFrameVersions.get(versionId);
    if (!version) continue;

    const next: StrengthFrameVersion = { ...version };
    let changed = false;

    const from = next.currentTarget?.fromMilestoneId;
    if (from !== undefined && removedMilestoneIds.has(from)) {
      delete next.currentTarget;
      changed = true;
    }

    if (referenced.has(versionId)) {
      const stillReferencing = remainingCompleted.filter((item) => frameVersionIdsOf(item).has(versionId));

      if (stillReferencing.length === 0) {
        if (next.firstOfficialWorkoutId !== undefined || next.frozenAt !== undefined) {
          delete next.firstOfficialWorkoutId;
          delete next.frozenAt;
          changed = true;
          unfrozen.push(versionId);
        }
      } else if (next.firstOfficialWorkoutId === deleted.id) {
        next.firstOfficialWorkoutId = stillReferencing[0]!.id;
        changed = true;
      }
    }

    if (changed) {
      next.updatedAt = now;
      await db.strengthFrameVersions.put(next);
    }
  }

  return unfrozen;
}
