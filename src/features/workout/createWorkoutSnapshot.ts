import type {
  GroupBlock,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  PerformedTestBlock,
  PlannedTest,
  SessionBlock,
  SessionTemplate,
  StrengthFrameVersion,
} from "../../domain";
import { DEFAULT_SERIES_ROLE } from "../../domain/rules/strengthRules";
import { lowOf } from "../../domain/rules/rangeRules";

/**
 * Version de cadre active par exercice (conception v1.6, § 4.3) : chargée
 * par l'appelant, jamais lue ici. Absente pour un exercice sans cadre.
 */
export type FrameVersionByExercise = ReadonlyMap<Id, Id>;

const NO_FRAMES: FrameVersionByExercise = new Map();

/** Versions de cadre chargées par l'appelant, pour comparer séries prévues et `workSets`. */
export type FrameVersionById = ReadonlyMap<Id, StrengthFrameVersion>;

const NO_VERSIONS: FrameVersionById = new Map();

/**
 * Prescription réduite (conception V2 § 2.5.1, D2) : la consigne prévoit
 * moins de séries que le cadre capturé n'en demande — leg curl de Muscu C
 * (2 séries contre 3), jour du test traction (lot G). La brique ne
 * validera jamais le palier et n'entrera pas dans la stagnation.
 */
function isReducedPrescription(
  instructions: Extract<SessionTemplate["blocks"][number], { kind: "exercise" }>["instructions"],
  version: StrengthFrameVersion | undefined,
): boolean {
  if (!version) return false;
  if (instructions.shape !== "reps" && instructions.shape !== "duration") return false;

  return instructions.sets < version.workSets;
}

function createExerciseBlock(
  block: Extract<SessionTemplate["blocks"][number], { kind: "exercise" }>,
  frameVersionByExercise: FrameVersionByExercise,
  versionById: FrameVersionById,
): PerformedExerciseBlock {
  const performedBlockId = `workout-block-${block.id}`;
  const frameVersionId = frameVersionByExercise.get(block.exerciseId);
  const reduced =
    frameVersionId !== undefined && isReducedPrescription(block.instructions, versionById.get(frameVersionId));

  const base: PerformedExerciseBlock = {
    id: performedBlockId,
    sourceBlockId: block.id,
    kind: "exercise",
    position: block.position,
    addedDuringWorkout: false,
    exerciseId: block.exerciseId,
    /* Point de capture 1 : la version du cadre au démarrage (§ 4.3). */
    ...(frameVersionId !== undefined ? { frameVersionId } : {}),
    /* Échauffement (D14) : recopié du modèle, il reste une vraie brique. */
    ...(block.role === "warmup" ? { role: "warmup" as const } : {}),
    ...(reduced ? { reducedPrescription: true } : {}),
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
        role: DEFAULT_SERIES_ROLE,
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
              /* Consigne en plage (D16) : le palier réalisé part du bas. */
              durationSec: lowOf(step.durationSec),
              speedKmh: lowOf(step.speedKmh),
              inclinePercent: lowOf(step.inclinePercent),
            }
          : {
              durationSec: lowOf(step.durationSec),
              ...(step.distanceKm !== undefined ? { distanceKm: step.distanceKm } : {}),
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

function createGroupBlock(
  block: GroupBlock,
  frameVersionByExercise: FrameVersionByExercise,
): PerformedGroupBlock {
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
        children: children.map((child) => {
          const frameVersionId = frameVersionByExercise.get(child.exerciseId);

          return {
            id: `${roundId}-child-${child.sourceChildId}`,
            groupChildId: child.id,
            exerciseId: child.exerciseId,
            /* La version suit l'exercice de CE tour, jamais l'enfant prévu. */
            ...(frameVersionId !== undefined ? { frameVersionId } : {}),
          };
        }),
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

/**
 * Un test attaché à l'instance démarrée (lot G.3) et la version de son
 * protocole, capturée au démarrage comme une version de cadre.
 */
export interface SnapshotTest {
  test: PlannedTest;
  protocolVersionId: Id;
}

/**
 * Ajustements du jour de test (§ 2.3) : moins de séries sur une brique
 * (traction assistée : 2 au lieu de 3). La brique devient une
 * prescription réduite : ni validation de palier, ni stagnation.
 */
function applyAdjustments(blocks: SessionBlock[], tests: ReadonlyArray<SnapshotTest>): SessionBlock[] {
  const sets = new Map<Id, number>();
  for (const { test } of tests) {
    for (const adjustment of test.adjustments ?? []) sets.set(adjustment.blockId, adjustment.sets);
  }
  if (sets.size === 0) return blocks;

  return blocks.map((block) => {
    const wanted = sets.get(block.id);
    if (wanted === undefined || block.kind !== "exercise") return block;
    const instructions = block.instructions;
    if (instructions.shape !== "reps" && instructions.shape !== "duration") return block;
    return { ...block, instructions: { ...instructions, sets: wanted } };
  });
}

function createTestBlock({ test, protocolVersionId }: SnapshotTest, replacedBlockId?: Id): PerformedTestBlock {
  return {
    id: `workout-block-test-${test.protocolId}`,
    kind: "test",
    position: 0,
    addedDuringWorkout: false,
    status: "not_performed",
    protocolId: test.protocolId,
    protocolVersionId,
    ...(replacedBlockId !== undefined ? { replacedBlockId } : {}),
  };
}

/**
 * Coupe un bloc à paliers autour du palier visé : les paliers d'avant,
 * le test, les paliers d'après (Cardio A, décision du 24/09/2026). Un
 * morceau vide disparaît ; `undefined` si le palier est introuvable.
 */
function splitAroundStep(
  block: PerformedExerciseBlock,
  stepId: Id,
  testBlock: PerformedTestBlock,
): PerformedBlock[] | undefined {
  const steps = block.cardioSteps ?? [];
  const index = steps.findIndex((step) => step.id === `${block.id}-step-${stepId}`);
  if (index < 0 || block.snapshotInstructions.shape !== "steps") return undefined;

  const instructions = block.snapshotInstructions;
  const part = (from: number, to: number, id: Id): PerformedExerciseBlock | undefined => {
    if (from >= to) return undefined;
    const kept = new Set(steps.slice(from, to).map((step) => step.id));
    const piece: PerformedExerciseBlock = {
      ...block,
      id,
      snapshotInstructions: {
        ...instructions,
        steps: instructions.steps
          .filter((step) => kept.has(`${block.id}-step-${step.id}`))
          .map((step, position) => ({ ...step, position })),
      },
      cardioSteps: steps.slice(from, to).map((step, position) => ({ ...step, position })),
    };
    /* La note du bloc (retour au calme) suit la fin du bloc. */
    if (to < steps.length) delete piece.note;
    return piece;
  };

  return [
    part(0, index, block.id),
    testBlock,
    part(index + 1, steps.length, `${block.id}-suite`),
  ].filter((item) => item !== undefined);
}

/**
 * Place les briques test (conception V2 § 3.5.1) :
 * - `replace_all` : la séance ne contient que ses tests, dans l'ordre ;
 * - `replace_block` : le test prend la place de la brique visée — ou,
 *   avec `targetStepId`, du seul palier visé ;
 * - `after_warmup` : après la dernière brique d'échauffement, sinon en tête ;
 * - `before_all` : en tête.
 * Plusieurs tests en tête gardent leur ordre. Les positions sont refaites.
 */
function placeTests(blocks: PerformedBlock[], tests: ReadonlyArray<SnapshotTest>): PerformedBlock[] {
  if (tests.length === 0) return blocks;
  if (tests.some(({ test }) => test.placement === "replace_all")) {
    return tests.map((item, position) => ({ ...createTestBlock(item), position }));
  }

  const result = [...blocks];
  let atHead = 0;

  for (const item of tests) {
    if (item.test.placement === "replace_block") {
      const index = result.findIndex(
        (block) => block.kind !== "test" && block.sourceBlockId === item.test.targetBlockId,
      );
      if (index >= 0) {
        const target = result[index]!;
        const testBlock = createTestBlock(item, item.test.targetBlockId);
        const split =
          item.test.targetStepId !== undefined && target.kind === "exercise"
            ? splitAroundStep(target, item.test.targetStepId, testBlock)
            : undefined;
        result.splice(index, 1, ...(split ?? [testBlock]));
        continue;
      }
    }

    if (item.test.placement !== "before_all") {
      const lastWarmup = result.reduce(
        (last, block, index) => (block.kind === "exercise" && block.role === "warmup" ? index : last),
        -1,
      );
      if (lastWarmup >= 0) {
        result.splice(lastWarmup + 1, 0, createTestBlock(item));
        continue;
      }
    }

    result.splice(atHead, 0, createTestBlock(item));
    atHead += 1;
  }

  return result.map((block, position) => ({ ...block, position }));
}

export function createWorkoutSnapshot(
  template: SessionTemplate,
  frameVersionByExercise: FrameVersionByExercise = NO_FRAMES,
  versionById: FrameVersionById = NO_VERSIONS,
  tests: ReadonlyArray<SnapshotTest> = [],
): PerformedBlock[] {
  const blocks = applyAdjustments(template.blocks, tests)
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
          return createExerciseBlock(block, frameVersionByExercise, versionById);

        case "group":
          return createGroupBlock(block, frameVersionByExercise);
      }
    });

  return placeTests(blocks, tests);
}