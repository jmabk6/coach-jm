import { getAllTestProtocols, getTestProtocolVersion, getTestResult } from "../../db/repositories/testRepository";
import type { Id, WorkoutSession } from "../../domain";
import { computeTestResult, formatTestNumber, measureUnit, primaryValue } from "../../domain/rules/testResultRules";

/**
 * Le bilan des tests d'une séance (M10.1) : le résultat principal de
 * chaque test réalisé, affiché « Nouveau repère », jamais « record »
 * (conception V2 § 5.6). En attente d'enregistrement, il se calcule sur
 * le brouillon ; une fois enregistré, il se lit dans le résultat (D27).
 */
export interface TestRecapCard {
  blockId: Id;
  name: string;
  /** « 38 kg d'assistance », « 132 bpm », ou « — ». */
  value: string;
  label: string;
  complete: boolean;
}

export async function loadTestNames(): Promise<Map<Id, string>> {
  return new Map((await getAllTestProtocols()).map((protocol) => [protocol.id, protocol.name]));
}

function formatPrimary(value: number, unit: string, protocolKeyIsTraction: boolean): string {
  const number = formatTestNumber(value);
  if (unit === "kg") return protocolKeyIsTraction ? `${number} kg d'assistance` : `${number} kg`;
  return unit ? `${number} ${unit}` : number;
}

export async function loadTestRecapCards(workout: WorkoutSession, names: ReadonlyMap<Id, string>): Promise<TestRecapCard[]> {
  const cards: TestRecapCard[] = [];

  for (const block of workout.blocks) {
    if (block.kind !== "test" || block.status !== "performed") continue;
    const version = await getTestProtocolVersion(block.protocolVersionId);
    if (!version) continue;

    const stored = block.testResultId ? await getTestResult(block.testResultId) : undefined;
    const result = stored ?? computeTestResult(version, block.draft);
    const spec = version.measures.find((measure) => measure.key === version.primaryMeasureKey);
    const value = primaryValue(version, result.measures);

    cards.push({
      blockId: block.id,
      name: names.get(block.protocolId) ?? "Test",
      value: value !== undefined && spec ? formatPrimary(value, measureUnit(spec, version), spec.key === "assistance_min_kg") : "—",
      label: spec?.label ?? "Résultat",
      complete: result.status === "complete",
    });
  }

  return cards;
}
