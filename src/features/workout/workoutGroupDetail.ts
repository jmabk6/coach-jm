import { formatGroupChildInstructionsRow } from "../../domain/rules/blockInstructionRules";
import type {
  Exercise,
  Id,
  PerformedGroupBlock,
  PerformedGroupRound,
  PerformedGroupRoundChild,
  PerformedSeries,
  WorkoutSession,
} from "../../domain";
import { calculateBlocksVolume, listCompletedRoundChildren, type CoveredAverage } from "./workoutRecap";

/**
 * Détail d'un groupe dans une réalisation (§14, mockup 19.2) : la
 * structure prévue, la réalisation tour par tour avec l'exercice
 * réellement effectué, les substitutions explicites, les repos entre
 * tours et avant un enfant — prévu et réel — sans rien inventer pour
 * un tour partiel ou non réalisé.
 */

/* -------------------------------------------------------------------------- */
/* Structure prévue                                                           */
/* -------------------------------------------------------------------------- */

export interface GroupStructureChild {
  groupChildId: Id;
  /** `1a`, `1b`… à partir du numéro de la brique. */
  label: string;
  exerciseId: Id;
  /** `10–12 reps · RPE 7–8`. */
  instructions: string;
  /** Repos exceptionnel prévu avant cet enfant, s'il existe. */
  restBeforeSec?: number;
}

export function describeGroupStructure(
  block: PerformedGroupBlock,
  blockNumber: string,
): GroupStructureChild[] {
  return [...block.children]
    .sort((a, b) => a.position - b.position)
    .map((child, index) => ({
      groupChildId: child.id,
      label: `${blockNumber}${String.fromCharCode(97 + index)}`,
      exerciseId: child.exerciseId,
      instructions: formatGroupChildInstructionsRow(child.snapshotInstructions),
      ...(child.snapshotRestBeforeSec !== undefined && child.snapshotRestBeforeSec > 0
        ? { restBeforeSec: child.snapshotRestBeforeSec }
        : {}),
    }));
}

/* -------------------------------------------------------------------------- */
/* Substitutions                                                              */
/* -------------------------------------------------------------------------- */

export interface GroupSubstitution {
  groupChildId: Id;
  fromExerciseId: Id;
  toExerciseId: Id;
  /** Premier tour joué avec le remplaçant. */
  fromRound: number;
  /**
   * Tours effectivement réalisés avec le remplaçant ; 0 si la
   * substitution n'a porté que sur des tours jamais faits.
   */
  roundsDone: number;
}

/**
 * Chaque changement d'exercice d'un enfant au fil des tours, dans
 * l'ordre : `prévu → remplaçant à partir du tour 2`, puis un éventuel
 * second remplacement ou un retour à l'exercice prévu.
 */
export function listGroupSubstitutions(block: PerformedGroupBlock): GroupSubstitution[] {
  const rounds = [...block.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const result: GroupSubstitution[] = [];

  for (const child of block.children) {
    let current = child.exerciseId;

    for (const round of rounds) {
      const roundChild = round.children.find((item) => item.groupChildId === child.id);

      if (!roundChild || roundChild.exerciseId === current) continue;

      const from = round.roundNumber;
      const to = roundChild.exerciseId;
      const roundsDone = rounds.filter(
        (item) =>
          item.roundNumber >= from &&
          item.children.some(
            (entry) =>
              entry.groupChildId === child.id && entry.exerciseId === to && entry.completedAt !== undefined,
          ),
      ).length;

      result.push({ groupChildId: child.id, fromExerciseId: current, toExerciseId: to, fromRound: from, roundsDone });
      current = to;
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Tour par tour                                                              */
/* -------------------------------------------------------------------------- */

export interface GroupRoundChildView {
  groupChildId: Id;
  exerciseId: Id;
  /** Vrai quand l'exercice de ce tour n'est pas celui prévu. */
  substituted: boolean;
  /** Ce qui a été saisi ; absent si l'enfant n'a pas été fait. */
  series?: PerformedSeries;
  restBefore?: { plannedSec?: number; actualSec?: number };
}

export interface RoundRestView {
  fromRound: number;
  toRound: number;
  plannedSec: number;
  actualSec?: number;
  adjustmentSec?: number;
  /** Faux quand une pause ou la fin de séance l'a coupé : hors moyenne. */
  comparable: boolean;
}

export interface GroupRoundView {
  roundNumber: number;
  status: "completed" | "partial" | "not_performed";
  doneCount: number;
  children: GroupRoundChildView[];
  /** Repos réel après ce tour, quand un tour suivait. */
  restAfter?: RoundRestView;
}

export function roundChildAsSeries(child: PerformedGroupRoundChild, position: number): PerformedSeries {
  return {
    id: child.id,
    position,
    status: "completed",
    ...(child.load !== undefined ? { load: child.load } : {}),
    ...(child.reps !== undefined ? { reps: child.reps } : {}),
    ...(child.durationSec !== undefined ? { durationSec: child.durationSec } : {}),
    ...(child.sideValues !== undefined ? { sideValues: child.sideValues } : {}),
    ...(child.rpe !== undefined ? { rpe: child.rpe } : {}),
    ...(child.note !== undefined ? { note: child.note } : {}),
    ...(child.completedAt !== undefined ? { completedAt: child.completedAt } : {}),
  };
}

function describeRestAfter(
  block: PerformedGroupBlock,
  round: PerformedGroupRound,
  hasNext: boolean,
): RoundRestView | undefined {
  if (!hasNext && round.actualRestAfterSec === undefined) return undefined;

  return {
    fromRound: round.roundNumber,
    toRound: round.roundNumber + 1,
    plannedSec: block.plannedRestBetweenRoundsSec,
    ...(round.actualRestAfterSec !== undefined ? { actualSec: round.actualRestAfterSec } : {}),
    ...(round.restAdjustmentSec !== undefined && round.restAdjustmentSec !== 0
      ? { adjustmentSec: round.restAdjustmentSec }
      : {}),
    comparable: round.actualRestAfterSec !== undefined && round.restComparable !== false,
  };
}

export function describeGroupRounds(block: PerformedGroupBlock): GroupRoundView[] {
  const rounds = [...block.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const children = [...block.children].sort((a, b) => a.position - b.position);

  return rounds.map((round, index) => {
    const views: GroupRoundChildView[] = children.map((child, position) => {
      const roundChild = round.children.find((item) => item.groupChildId === child.id);
      const exerciseId = roundChild?.exerciseId ?? child.exerciseId;
      const planned = child.snapshotRestBeforeSec;
      const actual = roundChild?.actualRestBeforeSec;
      const restBefore =
        (planned !== undefined && planned > 0) || actual !== undefined
          ? {
              ...(planned !== undefined && planned > 0 ? { plannedSec: planned } : {}),
              ...(actual !== undefined ? { actualSec: actual } : {}),
            }
          : undefined;

      return {
        groupChildId: child.id,
        exerciseId,
        substituted: exerciseId !== child.exerciseId,
        ...(roundChild && roundChild.completedAt !== undefined
          ? { series: roundChildAsSeries(roundChild, position) }
          : {}),
        ...(restBefore ? { restBefore } : {}),
      };
    });
    const doneCount = views.filter((view) => view.series !== undefined).length;
    const restAfter = describeRestAfter(block, round, index < rounds.length - 1);

    return {
      roundNumber: round.roundNumber,
      status: doneCount === 0 ? "not_performed" : doneCount < children.length ? "partial" : "completed",
      doneCount,
      children: views,
      ...(restAfter ? { restAfter } : {}),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Résumé                                                                     */
/* -------------------------------------------------------------------------- */

export interface GroupVolumeVsLast {
  previousWorkoutId: Id;
  previousDate: string;
  previousVolumeKg: number;
  deltaPercent: number;
}

export interface GroupDetailSummary {
  roundsDone: number;
  roundsPlanned: number;
  childrenCount: number;
  volumeKg?: number;
  volumeVsLast?: GroupVolumeVsLast;
  rpe?: CoveredAverage;
  restBetweenRounds?: {
    averageSec: number;
    plannedSec: number;
    deltaSec: number;
    comparableCount: number;
    totalCount: number;
  };
  /** Repos avant un enfant : conservés ici, jamais dans le repos moyen classique. */
  restBeforeChildren?: { count: number; totalSec: number };
}

/**
 * Un groupe est complet quand tous ses tours ont tous leurs enfants
 * faits ; comparable en volume quand, de plus, aucun enfant n'a été
 * remplacé.
 */
export function isGroupComplete(block: PerformedGroupBlock): boolean {
  return (
    block.status === "performed" &&
    block.rounds.length > 0 &&
    block.rounds.every((round) =>
      block.children.every((child) =>
        round.children.some((item) => item.groupChildId === child.id && item.completedAt !== undefined),
      ),
    )
  );
}

function isGroupReference(block: PerformedGroupBlock): boolean {
  return isGroupComplete(block) && listGroupSubstitutions(block).length === 0;
}

/**
 * `+8 % vs dernière fois` : la dernière réalisation terminée du même
 * modèle où le **même groupe** (même brique source) a été mené au bout
 * sans substitution, au même nombre de tours et d'enfants — et le
 * groupe courant est lui-même complet et sans substitution.
 */
export function compareGroupVolumeToPrevious(
  workout: WorkoutSession,
  block: PerformedGroupBlock,
  completedWorkouts: WorkoutSession[],
  exerciseById?: ReadonlyMap<Id, Exercise>,
): GroupVolumeVsLast | undefined {
  if (!workout.sessionTemplateId || !block.sourceBlockId || !isGroupReference(block)) return undefined;

  /* Une assistance ne pèse rien dans le volume (lot a) : chaque enfant
     compte selon l'exercice réellement effectué. */
  const volumeKg = calculateBlocksVolume([block], exerciseById);

  if (volumeKg <= 0) return undefined;

  const previous = [...completedWorkouts]
    .filter(
      (candidate) =>
        candidate.id !== workout.id &&
        candidate.status === "completed" &&
        candidate.sessionTemplateId === workout.sessionTemplateId &&
        candidate.startedAt < workout.startedAt,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const candidate of previous) {
    const match = candidate.blocks.find(
      (item): item is PerformedGroupBlock =>
        item.kind === "group" && item.sourceBlockId === block.sourceBlockId,
    );

    if (!match) continue;

    if (
      !isGroupReference(match) ||
      match.rounds.length !== block.rounds.length ||
      match.children.length !== block.children.length
    ) {
      return undefined;
    }

    const previousVolumeKg = calculateBlocksVolume([match], exerciseById);

    if (previousVolumeKg <= 0) return undefined;

    return {
      previousWorkoutId: candidate.id,
      previousDate: candidate.date,
      previousVolumeKg,
      deltaPercent: Math.round(((volumeKg - previousVolumeKg) / previousVolumeKg) * 100),
    };
  }

  return undefined;
}

export function summarizeGroupBlock(
  block: PerformedGroupBlock,
  volumeVsLast: GroupVolumeVsLast | undefined,
  exerciseById?: ReadonlyMap<Id, Exercise>,
): GroupDetailSummary {
  const rounds = describeGroupRounds(block);
  const done = listCompletedRoundChildren([block]);
  const volumeKg = calculateBlocksVolume([block], exerciseById);
  const rpes = done.map((item) => item.rpe).filter((v): v is number => v !== undefined);

  const rests = rounds.map((round) => round.restAfter).filter((rest): rest is RoundRestView => rest !== undefined && rest.actualSec !== undefined);
  const comparable = rests.filter((rest) => rest.comparable);
  const restBefore = rounds.flatMap((round) =>
    round.children.flatMap((child) =>
      child.restBefore?.actualSec !== undefined ? [child.restBefore.actualSec] : [],
    ),
  );

  return {
    roundsDone: rounds.filter((round) => round.status === "completed").length,
    roundsPlanned: block.rounds.length,
    childrenCount: block.children.length,
    ...(volumeKg > 0 ? { volumeKg } : {}),
    ...(volumeVsLast ? { volumeVsLast } : {}),
    ...(rpes.length > 0
      ? { rpe: { value: rpes.reduce((a, b) => a + b, 0) / rpes.length, count: rpes.length, total: done.length } }
      : {}),
    ...(comparable.length > 0
      ? {
          restBetweenRounds: {
            averageSec: Math.round(
              comparable.reduce((sum, rest) => sum + (rest.actualSec ?? 0), 0) / comparable.length,
            ),
            plannedSec: block.plannedRestBetweenRoundsSec,
            deltaSec:
              Math.round(comparable.reduce((sum, rest) => sum + (rest.actualSec ?? 0), 0) / comparable.length) -
              block.plannedRestBetweenRoundsSec,
            comparableCount: comparable.length,
            totalCount: rests.length,
          },
        }
      : {}),
    ...(restBefore.length > 0
      ? { restBeforeChildren: { count: restBefore.length, totalSec: restBefore.reduce((a, b) => a + b, 0) } }
      : {}),
  };
}

export function exerciseName(exerciseById: Map<Id, Exercise>, exerciseId: Id): string {
  return exerciseById.get(exerciseId)?.name ?? "Exercice supprimé";
}
