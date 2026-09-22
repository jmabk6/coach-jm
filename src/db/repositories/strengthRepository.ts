import { db } from "../database";
import type {
  Id,
  StrengthFrame,
  StrengthFrameVersion,
  StrengthMilestone,
} from "../../domain";

/**
 * Accès aux trois stores du module Musculation (conception v1.6, § 4.1
 * à § 4.3). Lecture et écriture élémentaires seulement : les règles
 * (figeage, validation, jalons à la clôture, suppression atomique avec
 * la séance) vivent dans le domaine et dans les cas d'usage du lot 4B.
 */

/* -------------------------------------------------------------------------- */
/* Cadres                                                                     */
/* -------------------------------------------------------------------------- */

export async function getStrengthFrame(id: Id): Promise<StrengthFrame | undefined> {
  return db.strengthFrames.get(id);
}

/** Le cadre d'un exercice : un par exercice suivi (§ 4.1). */
export async function getStrengthFrameByExercise(
  exerciseId: Id,
): Promise<StrengthFrame | undefined> {
  return db.strengthFrames.where("exerciseId").equals(exerciseId).first();
}

export async function getAllStrengthFrames(): Promise<StrengthFrame[]> {
  return db.strengthFrames.toArray();
}

export async function saveStrengthFrame(frame: StrengthFrame): Promise<void> {
  await db.strengthFrames.put(frame);
}

/* -------------------------------------------------------------------------- */
/* Versions                                                                   */
/* -------------------------------------------------------------------------- */

export async function getStrengthFrameVersion(
  id: Id,
): Promise<StrengthFrameVersion | undefined> {
  return db.strengthFrameVersions.get(id);
}

/** Toutes les versions d'un cadre, de la première à la dernière. */
export async function getStrengthFrameVersions(frameId: Id): Promise<StrengthFrameVersion[]> {
  const versions = await db.strengthFrameVersions.where("frameId").equals(frameId).toArray();

  return versions.sort((a, b) => a.number - b.number);
}

/**
 * La version active d'un cadre, lue par `activeVersionId` ; absente si
 * le cadre pointe une version disparue.
 */
export async function getActiveStrengthFrameVersion(
  frame: StrengthFrame,
): Promise<StrengthFrameVersion | undefined> {
  return db.strengthFrameVersions.get(frame.activeVersionId);
}

export async function saveStrengthFrameVersion(version: StrengthFrameVersion): Promise<void> {
  await db.strengthFrameVersions.put(version);
}

/* -------------------------------------------------------------------------- */
/* Jalons                                                                     */
/* -------------------------------------------------------------------------- */

/** Les jalons d'une version, du plus ancien au plus récent (§ 4.3). */
export async function getStrengthMilestonesByVersion(
  frameVersionId: Id,
): Promise<StrengthMilestone[]> {
  const milestones = await db.strengthMilestones
    .where("frameVersionId")
    .equals(frameVersionId)
    .toArray();

  return milestones.sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Les jalons créés à la clôture d'une séance donnée. */
export async function getStrengthMilestonesByWorkout(workoutId: Id): Promise<StrengthMilestone[]> {
  return db.strengthMilestones.where("workoutId").equals(workoutId).toArray();
}

export async function saveStrengthMilestone(milestone: StrengthMilestone): Promise<void> {
  await db.strengthMilestones.put(milestone);
}

/**
 * Retire les jalons d'une séance. À n'appeler que depuis la transaction
 * de suppression de la séance (décision 11, lot 4B) : hors transaction,
 * une séance sans ses jalons serait un état incohérent.
 */
export async function deleteStrengthMilestonesOfWorkout(workoutId: Id): Promise<number> {
  return db.strengthMilestones.where("workoutId").equals(workoutId).delete();
}
