import type { Load, NumberRange, PerformedSeries, StrengthFrameVersion, TargetRpe } from "../../domain";
import { formatFrameGoal, formatStrengthValue, loadToWork, type LoadToWork } from "../../domain/rules/strengthRules";
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

/* -------------------------------------------------------------------------- */
/* Exercice cadré : la double progression (lot 4C)                            */
/* -------------------------------------------------------------------------- */

export interface FrameLoadSuggestion {
  /** La charge (ou la durée) à travailler : objectif accepté, sinon dernière séance. */
  toWork?: LoadToWork;
  /** Ce qu'il faut tenir pour valider : « 3 × 12 · RPE ≤ 8 ». */
  goal: string;
}

/**
 * `Conseillé` d'un exercice **cadré** (conception v1.6, § 4.2 bis, § 4.6) :
 * plus d'heuristique sur le RPE de la dernière fois — la charge à
 * travailler vient de l'objectif accepté, sinon de la dernière série de
 * travail, et l'objectif de validation vient du cadre. Les exercices
 * sans cadre gardent `suggestLoad`.
 */
export function suggestFrameLoad(
  version: StrengthFrameVersion,
  lastSeries: ReadonlyArray<PerformedSeries> | undefined,
): FrameLoadSuggestion {
  const toWork = loadToWork(version, lastSeries);

  return { ...(toWork ? { toWork } : {}), goal: formatFrameGoal(version) };
}

/**
 * `102,5 kg (objectif accepté) · pour valider : 3 × 12 · RPE ≤ 8`,
 * `100 kg (dernière séance) · pour valider : …`, ou `pour valider : …`
 * seul quand rien n'indique encore la charge.
 */
export function formatFrameLoadSuggestion(suggestion: FrameLoadSuggestion): string {
  const goal = `pour valider : ${suggestion.goal}`;

  if (!suggestion.toWork) return goal;

  const source = suggestion.toWork.source === "objectif" ? "objectif accepté" : "dernière séance";

  return `${formatStrengthValue(suggestion.toWork.value, suggestion.toWork.unit)} (${source}) · ${goal}`;
}
