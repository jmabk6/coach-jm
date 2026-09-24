import type { TestProtocol, TestResult } from "../models";

/**
 * Recommandation d'entraînement à partir d'un test (conception V2 § 2.3) :
 * **infrastructure seulement**. Le registre est vide ; M10.3 n'affiche une
 * recommandation que si une règle existe. Aucune règle n'est codée en V1.
 */
export interface TestRecommendationRule {
  id: string;
  /** Clé du protocole concerné (`traction`, `cardio`…). */
  protocolKey: TestProtocol["key"];
  applies: (result: TestResult) => boolean;
  /** Texte de la recommandation, dans les mots de l'écran. */
  recommend: (result: TestResult) => string;
}

export const TEST_RECOMMENDATION_RULES: ReadonlyArray<TestRecommendationRule> = [];

export function recommendationsFor(
  protocol: Pick<TestProtocol, "key">,
  result: TestResult,
  rules: ReadonlyArray<TestRecommendationRule> = TEST_RECOMMENDATION_RULES,
): string[] {
  return rules.filter((rule) => rule.protocolKey === protocol.key && rule.applies(result)).map((rule) => rule.recommend(result));
}
