import { db } from "../../db/database";
import { getSetting } from "../../db/repositories/settingsRepository";
import { getAllTestProtocols, getAllTestResults, getTestProtocolVersion } from "../../db/repositories/testRepository";
import { getWeightEntries } from "../../db/repositories/weightRepository";
import type { Goal, TestCycleSettings, TestProtocol, TestProtocolVersion } from "../../domain";
import { goalBadge, goalProtocolId, goalRowText, type GoalBadge, type GoalRowText } from "../../domain/rules/goalListRules";
import { formatTestNumber } from "../../domain/rules/testResultRules";
import { goalProgressFrom } from "./goalProgress";
import { getAllGoals } from "../../db/repositories/goalRepository";

/**
 * Liste des objectifs (M4, lot H.3). Lit les objectifs, les résultats de
 * test, les pesées, les séances planifiées (tests attachés) et le
 * calendrier des tests ; n'écrit rien.
 */
export interface GoalListRow {
  goal: Goal;
  number: number;
  text: GoalRowText;
  badge?: GoalBadge;
}

export interface GoalList {
  rows: GoalListRow[];
  cycle?: TestCycleSettings;
}

/** Valeur avec l'unité de la mesure, lue sur la version active du protocole. */
function formatterFor(
  goal: Goal,
  measureKey: string | undefined,
  version: TestProtocolVersion | undefined,
): (value: number) => string {
  /* Poids : « 75 kg », « 78,4 kg » — pas de décimale inutile sur une cible. */
  if (goal.segments.some((segment) => segment.measure?.source === "weight_weekly_average")) return (value) => `${formatTestNumber(value)} kg`;
  const unit = version?.measures.find((measure) => measure.key === measureKey)?.unit ?? "";
  return (value) => (unit && unit !== "ratio" ? `${formatTestNumber(value)} ${unit}` : formatTestNumber(value));
}

export async function loadGoalList(today: string): Promise<GoalList> {
  const [goals, results, weights, protocols, sessions, cycle, schedule] = await Promise.all([
    getAllGoals(),
    getAllTestResults(),
    getWeightEntries(),
    getAllTestProtocols(),
    db.plannedSessions.toArray(),
    getSetting("testCycle"),
    getSetting("testSchedule"),
  ]);

  const protocolById = new Map<string, TestProtocol>(protocols.map((protocol) => [protocol.id, protocol]));
  const versions = await Promise.all(protocols.map((protocol) => getTestProtocolVersion(protocol.activeVersionId)));
  const versionByProtocol = new Map(protocols.map((protocol, index) => [protocol.id, versions[index]]));
  const weighedToday = weights.some((entry) => entry.date === today);

  const rows = [...goals]
    .sort((a, b) => a.position - b.position)
    .map((goal, index): GoalListRow => {
      const progress = goalProgressFrom(goal, results, weights, today);
      const { segment, evaluation } = progress;
      const protocolId = goalProtocolId(goal, segment);
      const protocol = protocolId ? protocolById.get(protocolId) : undefined;
      const measureKey = segment.measure?.source === "test" ? segment.measure.measureKey : undefined;
      const text = goalRowText(goal, segment, evaluation, formatterFor(goal, measureKey, protocolId ? versionByProtocol.get(protocolId) : undefined));
      const badge = goalBadge({
        goal,
        segment,
        /* Un protocole en pause n'a pas de prochain test. */
        protocolKey: protocol?.status === "active" ? protocol.key : undefined,
        sessions,
        schedule: schedule ?? [],
        cycle,
        results,
        weighedToday,
        today,
      });
      return { goal, number: index + 1, text, ...(badge ? { badge } : {}) };
    });

  return { rows, ...(cycle ? { cycle } : {}) };
}
