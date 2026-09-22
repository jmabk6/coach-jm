import type {
  Exercise,
  ExerciseInstructions,
  Id,
  Load,
  PerformedBlock,
  PerformedCardioStep,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  PerformedSeries,
  PerformedSideValue,
  WorkoutSession,
} from "../../../domain";
import { defaultInstructionsFor } from "../../../domain/rules/blockInstructionRules";
import { DEFAULT_SERIES_ROLE } from "../../../domain/rules/strengthRules";

/**
 * Lecture et fabrication des briques d'une réalisation : tout ce qui ne
 * touche pas au temps. Fonctions pures, sans effet de bord.
 */

export type ExecutableBlock = PerformedExerciseBlock | PerformedGroupBlock;

export function sortBlocks(blocks: PerformedBlock[]): PerformedBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position);
}

export function isExecutable(block: PerformedBlock): block is ExecutableBlock {
  return block.kind !== "note";
}

export function findBlock(workout: WorkoutSession, blockId: Id): PerformedBlock {
  const block = workout.blocks.find((item) => item.id === blockId);

  if (!block) {
    throw new Error("Brique introuvable dans la séance");
  }

  return block;
}

export function findExerciseBlock(
  workout: WorkoutSession,
  blockId: Id,
): PerformedExerciseBlock {
  const block = findBlock(workout, blockId);

  if (block.kind !== "exercise") {
    throw new Error("Cette brique n'est pas un exercice autonome");
  }

  return block;
}

export function findGroupBlock(
  workout: WorkoutSession,
  blockId: Id,
): PerformedGroupBlock {
  const block = findBlock(workout, blockId);

  if (block.kind !== "group") {
    throw new Error("Cette brique n'est pas un groupe");
  }

  return block;
}

/* -------------------------------------------------------------------------- */
/* Avancement d'une brique                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Une brique est commencée dès qu'une série, un palier, un tour ou une
 * mesure porte une validation.
 */
export function hasCompletedEntries(block: ExecutableBlock): boolean {
  if (block.kind === "group") {
    return block.rounds.some((round) =>
      round.children.some((child) => child.completedAt !== undefined),
    );
  }

  return (
    (block.series?.some((series) => series.status === "completed") ?? false) ||
    (block.cardioSteps?.some((step) => step.status === "completed") ?? false) ||
    block.simpleMeasurement?.completedAt !== undefined
  );
}

export function allEntriesCompleted(block: ExecutableBlock): boolean {
  if (block.kind === "group") {
    return (
      block.rounds.length > 0 &&
      block.rounds.every((round) => round.status === "completed")
    );
  }

  if (block.series) {
    return (
      block.series.length > 0 &&
      block.series.every((series) => series.status === "completed")
    );
  }

  if (block.cardioSteps) {
    return (
      block.cardioSteps.length > 0 &&
      block.cardioSteps.every((step) => step.status === "completed")
    );
  }

  return block.simpleMeasurement?.completedAt !== undefined;
}

/**
 * Nombre d'entrées sans consigne de compte : un exercice ajouté pendant
 * la séance n'a pas de nombre de séries prévu, et les séries ajoutées
 * au-delà du snapshot n'en ont pas non plus. Valider la dernière entrée
 * d'une telle brique ne la termine jamais : c'est `Terminer l'exercice`
 * qui le fait (décision du 17/09/2026).
 */
export function isOpenEndedBlock(block: ExecutableBlock): boolean {
  if (block.kind === "group") return false;

  /* Une mesure simple se valide en une fois : pas de liste, pas d'ajout (§11). */
  if (!block.series && !block.cardioSteps) return false;

  if (block.addedDuringWorkout) return true;

  const instructions = block.snapshotInstructions;

  if (
    block.series &&
    (instructions.shape === "reps" || instructions.shape === "duration")
  ) {
    return block.series.length > instructions.sets;
  }

  if (block.cardioSteps && instructions.shape === "steps") {
    return block.cardioSteps.length > instructions.steps.length;
  }

  return false;
}

/**
 * En cours : commencée, ni terminée ni sautée (§13, point d'insertion).
 */
export function isBlockInProgress(block: PerformedBlock): boolean {
  return (
    isExecutable(block) &&
    block.status === "not_performed" &&
    hasCompletedEntries(block)
  );
}

/**
 * Prochaine brique à exécuter après `afterBlockId`, dans l'ordre
 * structurel : ni note, ni sautée, ni terminée.
 */
export function findNextExecutableBlock(
  workout: WorkoutSession,
  afterBlockId: Id | undefined,
): ExecutableBlock | undefined {
  const ordered = sortBlocks(workout.blocks);
  const startIndex =
    afterBlockId === undefined
      ? 0
      : ordered.findIndex((block) => block.id === afterBlockId) + 1;

  for (const block of ordered.slice(startIndex)) {
    if (isExecutable(block) && block.status === "not_performed") {
      return block;
    }
  }

  return undefined;
}

/**
 * Première entrée non validée d'une brique : celle qui devient active.
 */
export function firstPendingEntryId(block: ExecutableBlock): Id | undefined {
  if (block.kind === "group") {
    return block.rounds.find((round) => round.status !== "completed")?.id;
  }

  if (block.series) {
    return block.series.find((series) => series.status !== "completed")?.id;
  }

  if (block.cardioSteps) {
    return block.cardioSteps.find((step) => step.status !== "completed")?.id;
  }

  return undefined;
}

/**
 * Point d'insertion d'un ajout (§13) : juste après la brique en cours,
 * sinon après la dernière brique terminée. Si rien n'a commencé
 * (décision du 17/09/2026), l'ajout va en fin de liste : il ne passe
 * jamais implicitement devant ce qui était prévu. Une séance libre vide
 * n'a pas de prévu : son premier ajout est son premier exercice.
 */
export function findInsertionIndex(blocks: PerformedBlock[]): number {
  const ordered = sortBlocks(blocks);

  const inProgressIndex = ordered.findIndex(isBlockInProgress);

  if (inProgressIndex >= 0) {
    return inProgressIndex + 1;
  }

  let lastPerformedIndex = -1;

  ordered.forEach((block, index) => {
    if (isExecutable(block) && block.status === "performed") {
      lastPerformedIndex = index;
    }
  });

  return lastPerformedIndex >= 0 ? lastPerformedIndex + 1 : ordered.length;
}

export interface BlockCompletion {
  completed: number;
  total: number;
  /**
   * Le mot du récapitulatif : `2 séries réalisées sur 3`.
   */
  unit: "série" | "palier" | "tour" | "mesure";
}

/**
 * Avancement d'une brique en entrées validées : ce que le récapitulatif
 * dit d'un exercice réalisé en partie (`2 séries réalisées sur 3`).
 */
export function summarizeBlockCompletion(block: ExecutableBlock): BlockCompletion {
  if (block.kind === "group") {
    return {
      completed: block.rounds.filter((round) => round.status === "completed").length,
      total: block.rounds.length,
      unit: "tour",
    };
  }

  if (block.series) {
    return {
      completed: block.series.filter((series) => series.status === "completed").length,
      total: block.series.length,
      unit: "série",
    };
  }

  if (block.cardioSteps) {
    return {
      completed: block.cardioSteps.filter((step) => step.status === "completed").length,
      total: block.cardioSteps.length,
      unit: "palier",
    };
  }

  return {
    completed: block.simpleMeasurement?.completedAt !== undefined ? 1 : 0,
    total: 1,
    unit: "mesure",
  };
}

export function formatBlockCompletion(completion: BlockCompletion): string {
  const { completed, total, unit } = completion;
  const plural = completed > 1 ? "s" : "";
  const feminine = unit === "série" || unit === "mesure";

  return `${completed} ${unit}${plural} réalisé${feminine ? "e" : ""}${plural} sur ${total}`;
}

/* -------------------------------------------------------------------------- */
/* Brique ajoutée pendant la séance                                           */
/* -------------------------------------------------------------------------- */

/**
 * Premier palier d'un exercice ajouté sans consigne (décision Q3 du
 * 17/09/2026) : cinq minutes à allure de marche, à ajuster avant de partir.
 */
const ADDED_STEP_DURATION_SEC = 300;
const ADDED_STEP_SPEED_KMH = 5;
const ADDED_STEP_DISTANCE_KM = 0.5;

/**
 * Consignes d'un exercice ajouté pendant la séance : les valeurs par
 * défaut du catalogue, ramenées à **une** série ou **un** palier — c'est
 * `Ajouter une série` qui fait grandir l'exercice, pas un prévu fictif.
 */
export function addedBlockInstructions(
  exercise: Exercise,
  newId: () => Id,
): ExerciseInstructions {
  const defaults = defaultInstructionsFor(exercise, newId);

  switch (defaults.shape) {
    case "reps":
    case "duration":
      return { ...defaults, sets: 1 };

    case "steps": {
      const first = defaults.steps[0];
      const step =
        first && "speedKmh" in first
          ? {
              id: newId(),
              position: 0,
              durationSec: ADDED_STEP_DURATION_SEC,
              speedKmh: ADDED_STEP_SPEED_KMH,
              inclinePercent: 0,
            }
          : {
              id: newId(),
              position: 0,
              durationSec: ADDED_STEP_DURATION_SEC,
              distanceKm: ADDED_STEP_DISTANCE_KM,
            };

      return { shape: "steps", steps: [step] };
    }

    default:
      return defaults;
  }
}

export function createAddedExerciseBlock(
  exercise: Exercise,
  position: number,
  newId: () => Id,
  /** Point de capture 2 (§ 4.3) : la version active du cadre de l'exercice ajouté. */
  frameVersionId?: Id,
): PerformedExerciseBlock {
  const id = `added-${newId()}`;
  const instructions = addedBlockInstructions(exercise, newId);

  const block: PerformedExerciseBlock = {
    id,
    kind: "exercise",
    position,
    addedDuringWorkout: true,
    exerciseId: exercise.id,
    ...(frameVersionId !== undefined ? { frameVersionId } : {}),
    status: "not_performed",
    snapshotInstructions: instructions,
  };

  if (instructions.shape === "reps" || instructions.shape === "duration") {
    block.series = [createSeries(`${id}-set-1`, 0)];
  } else if (instructions.shape === "steps") {
    block.cardioSteps = instructions.steps.map((step, index) => ({
      id: `${id}-step-${step.id}`,
      position: index,
      status: "upcoming",
      settings:
        "speedKmh" in step
          ? {
              durationSec: step.durationSec,
              speedKmh: step.speedKmh,
              inclinePercent: step.inclinePercent,
            }
          : { durationSec: step.durationSec, distanceKm: step.distanceKm },
    }));
  } else {
    block.simpleMeasurement = {};
  }

  return block;
}

/**
 * Une série neuve est une série de **travail** (décision 7, v1.6 § 4.4) ;
 * le formulaire permet d'en faire un échauffement. Les séries antérieures
 * au lot 4 n'ont pas de rôle et se lisent pareil (`seriesRoleOf`).
 */
export function createSeries(id: Id, position: number): PerformedSeries {
  return { id, position, status: "upcoming", role: DEFAULT_SERIES_ROLE };
}

export function createStepFrom(
  id: Id,
  position: number,
  previous: PerformedCardioStep | undefined,
): PerformedCardioStep {
  return {
    id,
    position,
    status: "upcoming",
    settings: previous
      ? structuredClone(previous.settings)
      : {
          durationSec: ADDED_STEP_DURATION_SEC,
          speedKmh: ADDED_STEP_SPEED_KMH,
          inclinePercent: 0,
        },
  };
}

/* -------------------------------------------------------------------------- */
/* Proposition de valeurs (Q3)                                                */
/* -------------------------------------------------------------------------- */

export interface ProposedSeriesValues {
  load?: Load;
  reps?: number;
  durationSec?: number;
  sideValues?: PerformedSideValue[];
}

/**
 * Valeurs proposées pour la prochaine série : celles de la série
 * précédente du même exercice dans cette séance, sinon celles de la
 * dernière fois, sinon la cible prévue. Une proposition, jamais une
 * validation : RPE et note ne sont jamais proposés.
 */
export function proposeSeriesValues(
  block: PerformedExerciseBlock,
  lastTime?: ProposedSeriesValues,
): ProposedSeriesValues {
  const previous = [...(block.series ?? [])]
    .reverse()
    .find((series) => series.status === "completed");

  const source = previous ?? lastTime;

  if (!source) {
    /* Rien de fait, rien d'historique : la cible prévue est préremplie
       (§11), reps hautes de la fourchette ou durée cible. */
    const instructions = block.snapshotInstructions;

    if (block.addedDuringWorkout) return {};
    if (instructions.shape === "reps") return { reps: instructions.reps.max };
    if (instructions.shape === "duration") return { durationSec: instructions.durationSec };

    return {};
  }

  return {
    ...(source.load !== undefined ? { load: structuredClone(source.load) } : {}),
    ...(source.reps !== undefined ? { reps: source.reps } : {}),
    ...(source.durationSec !== undefined ? { durationSec: source.durationSec } : {}),
    ...(source.sideValues !== undefined
      ? { sideValues: structuredClone(source.sideValues) }
      : {}),
  };
}

/**
 * Valeurs proposées pour un enfant de tour : celles du même enfant au
 * tour précédent dans cette séance, sinon la dernière fois, sinon la
 * cible prévue. RPE et note ne sont jamais proposés.
 */
export function proposeRoundChildValues(
  block: PerformedGroupBlock,
  groupChildId: Id,
  lastTime?: ProposedSeriesValues,
): ProposedSeriesValues {
  const previous = [...block.rounds]
    .reverse()
    .flatMap((round) => round.children)
    .find((child) => child.groupChildId === groupChildId && child.completedAt !== undefined);

  const source = previous ?? lastTime;

  if (!source) {
    const child = block.children.find((item) => item.id === groupChildId);
    const instructions = child?.snapshotInstructions;

    if (!instructions) return {};
    if (instructions.shape === "reps") return { reps: instructions.reps.max };

    return { durationSec: instructions.durationSec };
  }

  return {
    ...(source.load !== undefined ? { load: structuredClone(source.load) } : {}),
    ...(source.reps !== undefined ? { reps: source.reps } : {}),
    ...(source.durationSec !== undefined ? { durationSec: source.durationSec } : {}),
    ...(source.sideValues !== undefined
      ? { sideValues: structuredClone(source.sideValues) }
      : {}),
  };
}
