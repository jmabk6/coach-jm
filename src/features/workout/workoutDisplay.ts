import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
} from "../../domain";
import {
  formatDurationShort,
  formatRange,
} from "../../domain/rules/blockInstructionRules";
import { summarizeBlockCompletion } from "./engine/workoutBlocks";

/**
 * Libellés de l'écran de séance (§11) : numérotation visible, sous-titre
 * de brique, ligne `Prévu`. Lecture pure des briques de la réalisation.
 */

/**
 * Numérotation visible : exercices et groupes seulement, dans l'ordre
 * structurel ; une note n'a pas de numéro (§11).
 */
export function calculatePerformedNumbering(
  blocks: PerformedBlock[],
): Partial<Record<Id, number>> {
  const numbering: Partial<Record<Id, number>> = {};
  let visible = 0;

  for (const block of [...blocks].sort((a, b) => a.position - b.position)) {
    if (block.kind === "note") continue;

    visible += 1;
    numbering[block.id] = visible;
  }

  return numbering;
}

export function formatBlockStatus(block: PerformedExerciseBlock | PerformedGroupBlock): string {
  switch (block.status) {
    case "performed":
      return "Terminé";
    case "skipped":
      return "Sauté";
    default:
      return summarizeBlockCompletion(block).completed > 0 ? "En cours" : "À venir";
  }
}

/**
 * Sous-titre d'un exercice autonome : la structure (`3 séries · Repos 2 min`),
 * jamais redite dans `Prévu`.
 */
export function formatExerciseSubtitle(block: PerformedExerciseBlock): string {
  const instructions = block.snapshotInstructions;

  if (instructions.shape === "reps" || instructions.shape === "duration") {
    const count = block.series?.length ?? instructions.sets;
    const sets = count === 1 ? "1 série" : `${count} séries`;

    return `${sets} · Repos ${formatDurationShort(instructions.restBetweenSetsSec)}`;
  }

  if (instructions.shape === "steps") {
    const count = block.cardioSteps?.length ?? instructions.steps.length;

    return count === 1 ? "1 palier · Pas de repos" : `${count} paliers · Pas de repos`;
  }

  return "Mesure unique";
}

/**
 * Ligne `Prévu` du bloc de lecture : les cibles d'une série, pas la
 * structure. Absente pour un exercice ajouté pendant la séance : rien
 * n'était prévu.
 */
export function formatPlannedLine(block: PerformedExerciseBlock): string | undefined {
  if (block.addedDuringWorkout) return undefined;

  const instructions = block.snapshotInstructions;
  const parts: string[] = [];

  if (instructions.shape === "reps") {
    parts.push(`${formatRange(instructions.reps)} reps`);
  } else if (instructions.shape === "duration") {
    parts.push(formatDurationShort(instructions.durationSec));
  } else {
    return undefined;
  }

  if (instructions.targetRpe) {
    parts.push(`RPE ${formatRange(instructions.targetRpe)}`);
  }

  parts.push(`Repos ${formatDurationShort(instructions.restBetweenSetsSec)}`);

  return parts.join(" · ");
}

/**
 * Ce qu'une série à venir annonce sur sa ligne repliée : la cible.
 */
export function formatSeriesTarget(block: PerformedExerciseBlock): string {
  const instructions = block.snapshotInstructions;

  if (block.addedDuringWorkout) return "À saisir";

  if (instructions.shape === "reps") {
    return [
      `${formatRange(instructions.reps)} reps`,
      instructions.targetRpe ? `RPE ${formatRange(instructions.targetRpe)}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (instructions.shape === "duration") {
    return formatDurationShort(instructions.durationSec);
  }

  return "";
}

export function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-");

  return `${day}/${month}/${year}`;
}

/**
 * Les colonnes de saisie d'une série dépendent du type de mesure de
 * l'exercice (§2), et de lui seul.
 */
export type SeriesFieldLayout =
  | "load_reps"
  | "reps"
  | "duration"
  | "reps_per_side"
  | "duration_per_side";

export function seriesFieldLayout(exercise: Exercise | undefined): SeriesFieldLayout {
  switch (exercise?.measurementType) {
    case "reps":
      return "reps";
    case "duration":
      return "duration";
    case "reps_per_side":
      return "reps_per_side";
    case "duration_per_side":
      return "duration_per_side";
    default:
      return "load_reps";
  }
}
