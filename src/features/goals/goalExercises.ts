import { db } from "../../db/database";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import type { Exercise, ExerciseInstructions, Goal, SessionTemplate } from "../../domain";
import { formatDurationRange, formatExerciseInstructionsRow, formatGroupChildInstructionsRow, formatRange } from "../../domain/rules/blockInstructionRules";

/**
 * M6 — Objectif > Exercices (lot H.5) : les exercices liés, leurs médias,
 * et les modèles V1 qui les contiennent — lettres et prescription lues sur
 * les modèles installés, jamais recopiées. N'écrit rien.
 */
export interface GoalExerciseRow {
  exerciseId: string;
  exercise?: Exercise;
  /** Exercice supprimé ou archivé : ligne inactive. */
  inactive: boolean;
  /** Modèles V1 actifs qui le contiennent (lettre, catégorie, nom), dans l'ordre du programme ; vide hors programme. */
  templates: Array<{ letter: string; category: string; name: string }>;
  /** « 3 × 6–8 répétitions », celle du premier modèle qui le contient. */
  prescription?: string;
}

/** « 3 × 6–8 répétitions », « 3 × 20–30 s » ; le reste au format des consignes. */
export function formatPrescription(instructions: ExerciseInstructions): string {
  if (instructions.shape === "reps") return `${instructions.sets} × ${formatRange(instructions.reps)} répétitions`;
  if (instructions.shape === "duration") return `${instructions.sets} × ${formatDurationRange(instructions.durationSec)}`;
  return formatExerciseInstructionsRow(instructions);
}

/** Prescriptions de l'exercice dans un modèle, échauffement exclu ; un enfant de groupe au format du groupe. */
function occurrences(template: SessionTemplate, exerciseId: string): string[] {
  const found: string[] = [];
  for (const block of [...template.blocks].sort((a, b) => a.position - b.position)) {
    if (block.kind === "exercise" && block.exerciseId === exerciseId && block.role !== "warmup") found.push(formatPrescription(block.instructions));
    if (block.kind === "group") {
      for (const child of block.children) if (child.exerciseId === exerciseId) found.push(formatGroupChildInstructionsRow(child.instructions));
    }
  }
  return found;
}

export function goalExerciseRows(goal: Goal, exercises: ReadonlyArray<Exercise>, templates: ReadonlyArray<SessionTemplate>): GoalExerciseRow[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const program = templates
    .filter((template) => template.origin === "program_v1" && template.status === "active" && template.letter)
    .sort((a, b) => a.position - b.position);

  return goal.linkedExercises.map(({ exerciseId }) => {
    const exercise = byId.get(exerciseId);
    const holders = program.map((template) => ({ template, found: occurrences(template, exerciseId) })).filter((item) => item.found.length > 0);
    const first = holders[0]?.found[0];
    return {
      exerciseId,
      ...(exercise ? { exercise } : {}),
      inactive: !exercise || exercise.status === "archived",
      templates: holders.map(({ template }) => ({ letter: template.letter!, category: template.category, name: template.name })),
      ...(first ? { prescription: first } : {}),
    };
  });
}

export async function loadGoalExercises(goal: Goal): Promise<GoalExerciseRow[]> {
  const [exercises, templates] = await Promise.all([getAllExercises(), db.sessionTemplates.toArray()]);
  return goalExerciseRows(goal, exercises, templates);
}
