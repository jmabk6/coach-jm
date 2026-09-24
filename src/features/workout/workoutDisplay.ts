import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedCardioStep,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  WorkoutSession,
} from "../../domain";
import {
  formatDurationRange,
  formatDurationShort,
  formatGroupChildInstructionsRow,
  formatRange,
} from "../../domain/rules/blockInstructionRules";
import {
  summarizeBlockCompletion,
  type ProposedSeriesValues,
} from "./engine/workoutBlocks";
import { formatLoad, formatStepSettings } from "./workoutRecap";

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
    parts.push(formatDurationRange(instructions.durationSec));
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
    return formatDurationRange(instructions.durationSec);
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
  | "duration_per_side"
  | "reps_duration"
  | "duration_power";

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
    case "reps_duration":
      return "reps_duration";
    case "duration_power":
      return "duration_power";
    default:
      return "load_reps";
  }
}

/* -------------------------------------------------------------------------- */
/* Chrono et bloc Ensuite                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `1:05`, `12:07` : le format d'un décompte et d'un repos réel.
 */
export function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface NextUp {
  title: string;
  detail?: string;
}

/**
 * Bloc `Ensuite` de la carte de repos (§12) : ce qui attend à la fin du
 * repos — la série suivante du même exercice avec ses cibles et les
 * valeurs proposées, ou le premier pas de la brique suivante. Sur une
 * brique sans nombre prévu dont toutes les séries sont validées, le
 * choix revient à l'utilisateur.
 */
export function describeNextUp(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
  proposed: (block: PerformedExerciseBlock) => ProposedSeriesValues,
): NextUp | undefined {
  const rest = workout.activeRest;

  if (!rest || workout.currentBlockId === undefined) return undefined;

  const block = workout.blocks.find((item) => item.id === workout.currentBlockId);

  if (!block || block.kind === "note") return undefined;

  const sameBlock = block.id === rest.afterBlockId;
  const exerciseName = (id: Id) => exerciseById.get(id)?.name ?? "Exercice";

  if (block.kind === "group") {
    const round = block.rounds.find((item) => item.status !== "completed");
    const children = [...block.children].sort((a, b) => a.position - b.position);
    const firstChild = children[0];
    const firstRoundChild = round?.children.find((item) => item.groupChildId === firstChild?.id);
    const number = [...workout.blocks]
      .filter((item) => item.kind !== "note")
      .sort((a, b) => a.position - b.position)
      .findIndex((item) => item.id === block.id) + 1;

    return {
      title: `${block.name?.trim() || "Groupe"} — ${round ? `Tour ${round.roundNumber}` : "tour suivant"}`,
      ...(firstChild && firstRoundChild
        ? {
            detail: `${number}a ${exerciseName(firstRoundChild.exerciseId)} · ${formatGroupChildInstructionsRow(firstChild.snapshotInstructions)}`,
          }
        : {}),
    };
  }

  if (block.series) {
    const ordered = [...block.series].sort((a, b) => a.position - b.position);
    const pendingIndex = ordered.findIndex((series) => series.status !== "completed");

    if (pendingIndex < 0) {
      return {
        title: sameBlock ? "À toi de choisir" : exerciseName(block.exerciseId),
        detail: "Ajouter une série, ou Terminer l'exercice",
      };
    }

    const values = proposed(block);
    const proposal = formatProposedValues(values);
    const target = formatSeriesTarget(block);

    const detail = [
      target && target !== "À saisir" ? target : undefined,
      proposal ? `proposé ${proposal}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      title: sameBlock
        ? `Série ${pendingIndex + 1}`
        : `${exerciseName(block.exerciseId)} — Série ${pendingIndex + 1}`,
      ...(detail ? { detail } : {}),
    };
  }

  if (block.cardioSteps) {
    const step = block.cardioSteps.find((item) => item.status !== "completed");

    return {
      title: `${exerciseName(block.exerciseId)}${step ? ` — Palier ${step.position + 1}` : ""}`,
      ...(step ? { detail: formatStepSettingsLine(step) } : {}),
    };
  }

  return { title: exerciseName(block.exerciseId) };
}

function formatProposedValues(values: ProposedSeriesValues): string | undefined {
  const parts: string[] = [];

  if (values.load) parts.push(formatLoad(values.load));
  if (values.reps !== undefined) parts.push(values.load ? `× ${values.reps}` : `${values.reps} reps`);
  if (values.durationSec !== undefined) parts.push(formatDurationShort(values.durationSec));

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function formatStepSettingsLine(step: PerformedCardioStep): string {
  const settings = formatStepSettings(step);

  return `${settings.duration} · ${settings.first} · ${settings.second}`;
}
