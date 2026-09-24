import { db } from "../../db/database";
import type { Id, TestResult, WorkoutSession } from "../../domain";
import { computeTestResult } from "../../domain/rules/testResultRules";
import { freezeVersionForResult } from "./testProtocolVersioning";

export function testResultIdFor(workoutId: Id, blockId: Id): Id {
  return `test-result-${workoutId}-${blockId}`;
}

/**
 * À la confirmation (D27, SCHEMA § 8.2), **dans** la transaction de
 * `confirmWorkout` : pour chaque brique test réalisée, le `TestResult` est
 * créé (mesures entrées et dérivées, calculées une fois pour toutes), la
 * version du protocole se fige à son premier résultat, et la brique ne
 * garde que `testResultId`. Une brique sautée ou non réalisée perd son
 * brouillon (I-13) ; son test devient « à replanifier » par dérivation.
 */
export async function settleTestBlocks(workout: WorkoutSession, now: string): Promise<WorkoutSession> {
  if (!workout.blocks.some((block) => block.kind === "test")) return workout;

  const blocks = [];
  for (const block of workout.blocks) {
    if (block.kind !== "test") {
      blocks.push(block);
      continue;
    }

    const { draft, ...rest } = block;

    if (block.status !== "performed") {
      const cleared = { ...rest };
      delete cleared.testResultId;
      blocks.push(cleared);
      continue;
    }

    const version = await db.testProtocolVersions.get(block.protocolVersionId);
    if (!version) throw new Error("Version de protocole introuvable : le test ne peut pas être enregistré");

    const computed = computeTestResult(version, draft);
    const result: TestResult = {
      id: testResultIdFor(workout.id, block.id),
      protocolId: block.protocolId,
      versionId: block.protocolVersionId,
      date: workout.date,
      origin: "workout",
      workoutId: workout.id,
      blockId: block.id,
      status: computed.status,
      measures: computed.measures,
      ...(computed.trials ? { trials: computed.trials } : {}),
      ...(draft?.note ? { note: draft.note } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.testResults.put(result);
    await freezeVersionForResult(version.id, result.id, now);
    blocks.push({ ...rest, testResultId: result.id });
  }

  return { ...workout, blocks };
}

/**
 * À la suppression d'une séance (SCHEMA § 8.1), **dans** la transaction de
 * `deleteWorkout` : ses résultats d'origine séance disparaissent ; une
 * version figée par l'un d'eux se défige s'il ne lui reste aucun résultat,
 * sinon son premier résultat officiel devient le plus ancien restant.
 */
export async function removeWorkoutTestResults(workoutId: Id, now: string): Promise<void> {
  const results = await db.testResults.where("workoutId").equals(workoutId).toArray();
  const removed = results.filter((result) => result.origin === "workout");
  if (removed.length === 0) return;

  await db.testResults.bulkDelete(removed.map((result) => result.id));

  for (const versionId of new Set(removed.map((result) => result.versionId))) {
    const version = await db.testProtocolVersions.get(versionId);
    if (!version || !removed.some((result) => result.id === version.firstOfficialResultId)) continue;

    const remaining = (await db.testResults.where("versionId").equals(versionId).toArray()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    );
    const next = { ...version, updatedAt: now };
    if (remaining[0]) {
      next.firstOfficialResultId = remaining[0].id;
    } else {
      delete next.firstOfficialResultId;
      delete next.frozenAt;
    }
    await db.testProtocolVersions.put(next);
  }
}
