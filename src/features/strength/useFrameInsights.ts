import { useCallback, useEffect, useState } from "react";
import { db } from "../../db/database";
import { getStrengthMilestonesByVersion } from "../../db/repositories/strengthRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import type { Id, LoadSteps, StrengthFrameVersion, StrengthMilestone, WorkoutSession } from "../../domain";
import { detectStagnation, proposeRaise, type RaiseProposal, type Stagnation } from "../../domain/rules/strengthRules";
import { getProgressionTracks, suspendedExerciseIds } from "../perspectives/trackStore";

/**
 * Encarts de progression en séance (lot M.1) : pour chaque version de
 * cadre capturée dans la séance, la hausse proposée et la stagnation — les
 * mêmes règles que la fiche exercice (lot 4C), lues sur les séances
 * enregistrées. La séance en cours n'y compte pas : elle n'est pas finie.
 */
export interface FrameInsight {
  version: StrengthFrameVersion;
  raise?: RaiseProposal;
  stagnation?: Stagnation;
}

export function frameInsightsFor(
  versions: ReadonlyArray<StrengthFrameVersion>,
  milestones: ReadonlyArray<StrengthMilestone>,
  completed: ReadonlyArray<WorkoutSession>,
  /** Crans réels par cadre (22/10/2026) : la hausse ne propose qu'une charge qui existe. */
  stepsByFrame: ReadonlyMap<Id, LoadSteps> = new Map(),
  /** Cadres dont la hausse automatique est suspendue (douleur) : aucun encart. */
  suspendedFrames: ReadonlySet<Id> = new Set(),
): Map<Id, FrameInsight> {
  const result = new Map<Id, FrameInsight>();
  for (const version of versions) {
    if (suspendedFrames.has(version.frameId)) continue;
    const own = milestones.filter((milestone) => milestone.frameVersionId === version.id);
    const raise = proposeRaise(version, own, completed, stepsByFrame.get(version.frameId));
    const stagnation = detectStagnation(version, completed, own);
    if (raise || stagnation) result.set(version.id, { version, ...(raise ? { raise } : {}), ...(stagnation ? { stagnation } : {}) });
  }
  return result;
}

export function useFrameInsights(
  workout: Pick<WorkoutSession, "blocks"> | undefined,
  versionById: ReadonlyMap<Id, StrengthFrameVersion>,
): { insights: Map<Id, FrameInsight>; reload: () => void } {
  const [insights, setInsights] = useState<Map<Id, FrameInsight>>(new Map());
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  const ids = [
    ...new Set(
      (workout?.blocks ?? []).flatMap((block) => (block.kind === "exercise" && block.frameVersionId ? [block.frameVersionId] : [])),
    ),
  ].sort();
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    const wanted = key.split(",").filter((id) => versionById.has(id));
    if (wanted.length === 0) return;

    async function load() {
      /* Relue en base : une hausse acceptée pendant la séance change la version. */
      const versions = (await db.strengthFrameVersions.bulkGet(wanted)).filter(
        (version): version is StrengthFrameVersion => version !== undefined,
      );
      const [completed, tracks, frames, ...lists] = await Promise.all([
        getCompletedWorkouts(),
        getProgressionTracks(),
        db.strengthFrames.bulkGet([...new Set(versions.map((version) => version.frameId))]),
        ...versions.map((version) => getStrengthMilestonesByVersion(version.id)),
      ]);
      const exercises = await db.exercises.bulkGet(frames.flatMap((frame) => (frame ? [frame.exerciseId] : [])));
      const stepsByFrame = new Map<Id, LoadSteps>();
      const suspended = suspendedExerciseIds(tracks);
      const suspendedFrames = new Set<Id>();
      for (const frame of frames) {
        const steps = frame ? exercises.find((exercise) => exercise?.id === frame.exerciseId)?.loadSteps : undefined;
        if (frame && steps) stepsByFrame.set(frame.id, steps);
        if (frame && suspended.has(frame.exerciseId)) suspendedFrames.add(frame.id);
      }
      if (!cancelled) setInsights(frameInsightsFor(versions, lists.flat(), completed as WorkoutSession[], stepsByFrame, suspendedFrames));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [key, versionById, revision]);

  return { insights, reload };
}
