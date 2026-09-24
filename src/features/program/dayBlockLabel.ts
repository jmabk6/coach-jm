import type { Exercise, Id, SessionBlock } from "../../domain";
import { formatExerciseInstructionsRow, formatValueRange } from "../../domain/rules/blockInstructionRules";
import { midOf } from "../../domain/rules/rangeRules";

/** Au-delà, un palier de tapis n'est plus de la marche. */
const WALKING_MAX_KMH = 6.5;
/** Une note de bloc sert de libellé si c'est une courte phrase (« Retour au calme. »). */
const NOTE_LABEL_MAX_LENGTH = 40;

function noteLabel(notes: string | undefined): string | undefined {
  const text = notes?.trim().replace(/\.$/, "");
  if (!text || text.length > NOTE_LABEL_MAX_LENGTH || /[.:;]/.test(text)) return undefined;
  return text;
}

/**
 * Libellé d'un bloc dans la fiche d'un jour (M3, décision du 24/09) : ce
 * qu'on y fait, jamais le nom de l'exercice répété.
 *
 * - brique d'échauffement : « Échauffement » ;
 * - note courte du bloc : « Retour au calme » ;
 * - un seul palier de tapis : « Marche 5 km/h · pente 6-8 % » ;
 * - plusieurs paliers : « Vélo · 18 paliers · 39 min » ;
 * - séries : « Squat barre · 3 × 8-10 reps » ;
 * - groupe : son nom et ses tours.
 */
export function dayBlockLabel(block: SessionBlock, exerciseById: ReadonlyMap<Id, Exercise>, index: number): string {
  if (block.kind === "note") return block.title ?? "Note";

  if (block.kind === "group") {
    return `${block.name || `Groupe ${index + 1}`} · ${block.rounds} tour${block.rounds > 1 ? "s" : ""}`;
  }

  if (block.role === "warmup") return "Échauffement";

  const fromNote = noteLabel(block.notes);
  if (fromNote) return fromNote;

  const name = exerciseById.get(block.exerciseId)?.name ?? "Exercice";
  const instructions = block.instructions;

  if (instructions.shape === "steps" && instructions.steps.length === 1) {
    const step = instructions.steps[0]!;
    if ("speedKmh" in step) {
      const walking = midOf(step.speedKmh) <= WALKING_MAX_KMH;
      return [
        `${walking ? "Marche " : ""}${formatValueRange(step.speedKmh, "km/h")}`,
        `pente ${formatValueRange(step.inclinePercent, "%")}`,
      ].join(" · ");
    }
  }

  /* Séries ou paliers : le nom de l'exercice, puis la consigne sans le repos. */
  const prescription = formatExerciseInstructionsRow(instructions)
    .split(" · ")
    .filter((part) => !part.startsWith("repos"))
    .join(" · ");

  return prescription ? `${name} · ${prescription}` : name;
}
