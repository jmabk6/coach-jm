import type {
  GroupBlock,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  SessionTemplate,
} from "../../domain";

function createExerciseBlock(
  block: Extract<SessionTemplate["blocks"][number], { kind: "exercise" }>,
): PerformedExerciseBlock {
  const performedBlockId = `workout-block-${block.id}`;

  const base: PerformedExerciseBlock = {
    id: performedBlockId,
    sourceBlockId: block.id,
    kind: "exercise",
    position: block.position,
    addedDuringWorkout: false,
    exerciseId: block.exerciseId,
    status: "not_performed",
    snapshotInstructions: structuredClone(block.instructions),
  };

  if (block.notes !== undefined) {
    base.note = block.notes;
  }

  if (
    block.instructions.shape === "reps" ||
    block.instructions.shape === "duration"
  ) {
    base.series = Array.from(
      { length: block.instructions.sets },
      (_, index) => ({
        id: `${performedBlockId}-set-${index + 1}`,
        position: index,
        status: "upcoming" as const,
      }),
    );
  }

  if (block.instructions.shape === "steps") {
    base.cardioSteps = block.instructions.steps.map((step) => ({
      id: `${performedBlockId}-step-${step.id}`,
      position: step.position,
      status: "upcoming",
      settings:
        "speedKmh" in step
          ? {
              durationSec: step.durationSec,
              speedKmh: step.speedKmh,
              inclinePercent: step.inclinePercent,
            }
          : {
              durationSec: step.durationSec,
              distanceKm: step.distanceKm,
            },
    }));
  }

  if (
    block.instructions.shape === "duration_distance" ||
    block.instructions.shape === "distance" ||
    block.instructions.shape === "distance_cm" ||
    block.instructions.shape === "distance_cm_per_side"
  ) {
    base.simpleMeasurement = {};
  }

  return base;
}

function createGroupBlock(block: GroupBlock): PerformedGroupBlock {
  const performedBlockId = `workout-block-${block.id}`;

  const children = block.children.map((child) => {
    const performedChildId =
      `${performedBlockId}-child-${child.id}`;

    return {
      id: performedChildId,
      sourceChildId: child.id,
      position: child.position,
      exerciseId: child.exerciseId,
      snapshotInstructions: structuredClone(child.instructions),
      ...(child.restBeforeSec !== undefined
        ? { snapshotRestBeforeSec: child.restBeforeSec }
        : {}),
      ...(child.notes !== undefined
        ? { note: child.notes }
        : {}),
    };
  });

  const rounds = Array.from(
    { length: block.rounds },
    (_, roundIndex) => {
      const roundNumber = roundIndex + 1;
      const roundId = `${performedBlockId}-round-${roundNumber}`;

      return {
        id: roundId,
        roundNumber,
        status: "upcoming" as const,
        children: children.map((child) => ({
          id: `${roundId}-child-${child.sourceChildId}`,
          groupChildId: child.id,
          exerciseId: child.exerciseId,
        })),
      };
    },
  );

  return {
    id: performedBlockId,
    sourceBlockId: block.id,
    kind: "group",
    position: block.position,
    addedDuringWorkout: false,
    status: "not_performed",
    ...(block.name !== undefined ? { name: block.name } : {}),
    ...(block.description !== undefined
      ? { description: block.description }
      : {}),
    plannedRounds: block.rounds,
    plannedRestBetweenRoundsSec: block.restBetweenRoundsSec,
    children,
    rounds,
  };
}

export function createWorkoutSnapshot(
  template: SessionTemplate,
): PerformedBlock[] {
  return template.blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block): PerformedBlock => {
      switch (block.kind) {
        case "note":
          return {
            id: `workout-block-${block.id}`,
            sourceBlockId: block.id,
            kind: "note",
            position: block.position,
            addedDuringWorkout: false,
            ...(block.title !== undefined
              ? { title: block.title }
              : {}),
            text: block.text,
          };

        case "exercise":
          return createExerciseBlock(block);

        case "group":
          return createGroupBlock(block);
      }
    });
}