import type { PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { BET_EXERCISE_ID, BET_FORCE_TEMPLATES, BET_LIGHT_TEMPLATE, formatBetSets, testHint, type BetProgress } from "../goals/tractionBet";
import type { BetBanner } from "./ExerciseBlockCard";

/**
 * Le bandeau du pari traction dans la séance (03/10/2026) :
 * - Muscu A : palier actuel, dernière séance, ce qu'il faut faire, ce qui
 *   valide, la suite — et le statut du pari ;
 * - jour de test (2 séries) : les 2 séries, et le palier à attaquer ;
 * - Muscu B : le rappel léger, 2 × 10 un palier au-dessus.
 * Ailleurs : rien.
 */
export function betBannerFor(workout: WorkoutSession, block: PerformedExerciseBlock, progress: BetProgress): BetBanner | undefined {
  if (block.exerciseId !== BET_EXERCISE_ID) return undefined;
  const { prescription, last } = progress;
  const status = { label: progress.statusLabel, tone: progress.status };

  if (workout.sessionTemplateId === BET_LIGHT_TEMPLATE) {
    const sets = [
      { assistKg: prescription.lightAssistKg, reps: 10 },
      { assistKg: prescription.lightAssistKg, reps: 10 },
    ];
    return {
      title: `Rappel léger — ${prescription.lightAssistKg} kg d'aide`,
      /* La consigne du modèle dit déjà le pourquoi (un palier au-dessus de A, RPE 6-7). */
      lines: [{ label: "Cette séance", value: `2 × 10, RPE 6-7` }],
      sets,
    };
  }

  if (!BET_FORCE_TEMPLATES.includes(workout.sessionTemplateId ?? "")) return undefined;

  if (block.reducedPrescription) {
    const sets = prescription.sets.slice(0, 2);
    return {
      title: `Jour de test — ${prescription.levelKg} kg d'aide`,
      status,
      lines: [{ label: "Après le test", value: formatBetSets(sets) }],
      note: testHint(prescription),
      sets,
    };
  }

  const lastLine = last
    ? `${last.sets.map((set) => set.reps).join(" / ")}${last.sets.some((set) => set.rpe !== undefined) ? ` — RPE ${last.sets.map((set) => set.rpe ?? "—").join(" / ")}` : ""}${
        new Set(last.sets.map((set) => set.assistKg)).size > 1 ? ` (${formatBetSets(last.sets)})` : ""
      }`
    : "—";

  return {
    title: `Palier actuel — ${prescription.levelKg} kg d'aide`,
    status,
    lines: [
      { label: "Dernière séance", value: lastLine },
      { label: "Cette séance", value: prescription.minimum },
      { label: "Validation", value: prescription.validation },
      { label: "Ensuite", value: prescription.next },
    ],
    ...(prescription.note ? { note: prescription.note } : {}),
    sets: prescription.sets,
  };
}
