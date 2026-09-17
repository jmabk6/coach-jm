import type { Load, NumberRange, TargetRpe } from "../../domain";
import {
  calculateSuggestedLoad,
  getLoadKg,
  type SuggestedLoadAction,
} from "../../domain/rules/workoutRules";
import type { LastPerformance } from "./lastPerformance";
import { formatLoad } from "./workoutRecap";

/**
 * Pas de progression d'une charge conseillée : le plus petit disque
 * courant. Ce n'est pas une règle de la spec (§1 ne fixe pas le pas) :
 * décision d'implémentation du 17/09/2026, à ajuster à l'usage.
 */
export const SUGGESTED_LOAD_STEP_KG = 2.5;

export interface LoadSuggestion {
  load: Load;
  action: SuggestedLoadAction;
  referenceLoad: Load;
}

/**
 * `Conseillé` (§1, §11) : calculé depuis la dernière réalisation de
 * l'exercice — monte si les reps ont été tenues avec un RPE bas, baisse
 * si RPE 9–10 ou reps en chute, maintient sinon. Jamais stocké dans le
 * modèle. Sans historique, rien.
 */
export function suggestLoad(
  lastTime: LastPerformance | undefined,
  targetReps: NumberRange,
  targetRpe?: TargetRpe,
): LoadSuggestion | undefined {
  if (!lastTime) return undefined;

  const result = calculateSuggestedLoad(lastTime.allSeries, targetReps, {
    lowRpeMax: targetRpe ? Math.max(1, targetRpe.min - 1) : 7,
  });

  if (!result) return undefined;

  const reference = result.referenceLoad;
  const delta =
    result.action === "increase"
      ? SUGGESTED_LOAD_STEP_KG
      : result.action === "decrease"
        ? -SUGGESTED_LOAD_STEP_KG
        : 0;

  let load: Load;

  switch (reference.kind) {
    case "total":
      load = { kind: "total", kg: Math.max(0, reference.kg + delta) };
      break;
    case "per_side":
      load = {
        kind: "per_side",
        kgPerSide: Math.max(0, reference.kgPerSide + delta / 2),
        ...(reference.tareKg !== undefined ? { tareKg: reference.tareKg } : {}),
      };
      break;
    case "empty":
      load =
        delta > 0
          ? { kind: "total", kg: (getLoadKg(reference) ?? 0) + delta }
          : { kind: "empty", ...(reference.tareKg !== undefined ? { tareKg: reference.tareKg } : {}) };
      break;
  }

  return { load, action: result.action, referenceLoad: reference };
}

/**
 * `42,5 kg · +2,5 kg`, `40 kg · maintien`, `37,5 kg · −2,5 kg`.
 */
export function formatLoadSuggestion(suggestion: LoadSuggestion): string {
  const reason =
    suggestion.action === "increase"
      ? `+${SUGGESTED_LOAD_STEP_KG.toString().replace(".", ",")} kg`
      : suggestion.action === "decrease"
        ? `−${SUGGESTED_LOAD_STEP_KG.toString().replace(".", ",")} kg`
        : "maintien";

  return `${formatLoad(suggestion.load)} · ${reason}`;
}
