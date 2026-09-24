import { getAllGoals } from "../../db/repositories/goalRepository";
import { getAllTestResults } from "../../db/repositories/testRepository";
import { getWeightEntries } from "../../db/repositories/weightRepository";
import type { Goal, GoalSegment, TestResult, WeightEntry } from "../../domain";
import {
  evaluateSegment,
  goalCurve,
  testPointsFor,
  weightPointsFor,
  type GoalCurve,
  type GoalPoint,
  type SegmentEvaluation,
} from "../../domain/rules/goalRules";

/**
 * Progression des objectifs (lot H.2) : lit **seulement** les objectifs,
 * les résultats de test et les pesées — jamais les séances ni les jalons
 * (invariant § 2.2 : une carte ou une courbe n'affiche jamais une
 * performance d'entraînement comme un résultat de test).
 */
export interface GoalProgress {
  goal: Goal;
  segment: GoalSegment;
  evaluation: SegmentEvaluation;
  pointsBySegment: Map<string, GoalPoint[]>;
  curve: GoalCurve;
}

export function goalProgressFrom(
  goal: Goal,
  results: ReadonlyArray<TestResult>,
  weights: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>,
  today: string,
): GoalProgress {
  const pointsBySegment = new Map<string, GoalPoint[]>();
  let provisional: GoalPoint | undefined;

  for (const segment of goal.segments) {
    if (segment.measure?.source === "weight_weekly_average") {
      const weightPoints = weightPointsFor(weights, today);
      pointsBySegment.set(segment.id, weightPoints.weeks);
      provisional = weightPoints.provisional;
    } else {
      pointsBySegment.set(segment.id, testPointsFor(segment, results));
    }
  }

  const segment = goal.segments.find((item) => item.id === goal.currentSegmentId) ?? goal.segments[0]!;
  return {
    goal,
    segment,
    evaluation: evaluateSegment(goal, segment, pointsBySegment.get(segment.id) ?? []),
    pointsBySegment,
    curve: goalCurve(goal, pointsBySegment, provisional),
  };
}

export async function loadGoalsProgress(today: string): Promise<GoalProgress[]> {
  const [goals, results, weights] = await Promise.all([getAllGoals(), getAllTestResults(), getWeightEntries()]);
  return goals.map((goal) => goalProgressFrom(goal, results, weights, today));
}
