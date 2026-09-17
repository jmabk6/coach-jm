import type { Load, NumberRange, TargetRpe } from "../../domain";
import {
  calculateSuggestedLoad,
  type SuggestedLoadAction,
} from "../../domain/rules/workoutRules";
import type { LastPerformance } from "./lastPerformance";
import { formatLoad } from "./workoutRecap";

export interface LoadSuggestion {
  /**
   * La dernière charge comparable : la référence, jamais une charge
   * inventée. Les paliers diffèrent d'une machine ou d'un haltère à
   * l'autre ; tant que l'incrément propre à l'exercice n'est pas défini,
   * le conseil reste qualitatif (décision du 17/09/2026).
   */
  referenceLoad: Load;
  action: SuggestedLoadAction;
}

/**
 * `Conseillé` (§1, §11) : lu depuis la dernière réalisation de
 * l'exercice — progression envisageable si les reps ont été tenues avec
 * un RPE bas, réduction à envisager si RPE 9–10 ou reps en chute,
 * maintien sinon. Jamais stocké dans le modèle ; rien sans historique.
 * La règle précise du RPE et des répétitions reste à définir avant
 * d'être figée dans la spec.
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

  return { referenceLoad: result.referenceLoad, action: result.action };
}

const ACTION_LABELS: Record<SuggestedLoadAction, string> = {
  increase: "progression envisageable",
  maintain: "maintien",
  decrease: "réduction à envisager",
};

/**
 * `40 kg · progression envisageable`, `40 kg · maintien`,
 * `40 kg · réduction à envisager` — la référence et une indication,
 * pas une consigne chiffrée.
 */
export function formatLoadSuggestion(suggestion: LoadSuggestion): string {
  return `${formatLoad(suggestion.referenceLoad)} · ${ACTION_LABELS[suggestion.action]}`;
}
