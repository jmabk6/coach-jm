import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { TestResult } from "../../domain";
import { recommendationsFor, TEST_RECOMMENDATION_RULES } from "../../domain/rules/testRecommendationRules";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { seedSettingsDefaults } from "../seed/seedSettingsDefaults";
import { deleteManualTestResult, saveManualTestResult } from "./manualTestResult";
import { seedTestProtocols } from "./seedTestProtocols";

/**
 * Lot G.6 — saisie d'un test passé (origine `manual`, date choisie) et sa
 * suppression ; registre de recommandations vide. Cas réel : les tests du
 * 27/09 au 03/10/2026, notés sur papier, saisis après coup.
 */

const TODAY = "2026-10-04";
const NOW = "2026-10-04T08:00:00.000Z";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedSettingsDefaults(new Date(NOW));
  await db.transaction("rw", db.exercises, () => seedExerciseCatalog());
  await seedTestProtocols(NOW);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

const trial = (order: number, value: number, outcome: "success" | "failure") => ({ order, value, outcome, completedAt: NOW });

describe("semaine de tests du 27/09, saisie après coup", () => {
  it("traction du 27/09, souplesse du 28/09, mensurations du 28/09 : résultats datés, versions figées", async () => {
    const traction = await saveManualTestResult(
      { protocolId: "protocol-traction", date: "2026-09-27", draft: { trials: [trial(1, 40, "success"), trial(2, 37, "success"), trial(3, 34, "failure")] } },
      TODAY, NOW,
    );
    const souplesse = await saveManualTestResult(
      { protocolId: "protocol-souplesse", date: "2026-09-28", draft: { values: { doigts_sol_cm: 3, papillon_cm: 21 }, sideValues: { apley_cm: { left: 8, right: 12 } } } },
      TODAY, NOW,
    );
    const mensurations = await saveManualTestResult(
      { protocolId: "protocol-mensurations", date: "2026-09-28", draft: { values: { epaules_cm: 116, taille_cm: 94 } }, conditionsRespected: false, conditionsNote: "  mesuré le soir  " },
      TODAY, NOW,
    );

    expect(traction).toMatchObject({ origin: "manual", date: "2026-09-27", status: "complete", versionId: "protocol-traction-v1" });
    expect(traction.measures).toContainEqual({ key: "assistance_min_kg", value: 37, unit: "kg" });
    expect(traction.workoutId).toBeUndefined();
    expect(souplesse.status).toBe("complete");
    expect(mensurations).toMatchObject({ conditionsRespected: false, conditionsNote: "mesuré le soir" });
    expect(mensurations.measures).toContainEqual({ key: "ratio_epaules_taille", value: 1.23, unit: "" });

    for (const [versionId, result] of [["protocol-traction-v1", traction], ["protocol-souplesse-v1", souplesse]] as const) {
      expect(await db.testProtocolVersions.get(versionId)).toMatchObject({ firstOfficialResultId: result.id, frozenAt: NOW });
    }
  });

  it("refus : date future, doublon du même jour, test en pause, aucune mesure", async () => {
    const draft = { values: { planche_duree_s: 70 } };
    await expect(saveManualTestResult({ protocolId: "protocol-tronc", date: "2026-10-05", draft }, TODAY, NOW)).rejects.toThrow(/futur/);

    await saveManualTestResult({ protocolId: "protocol-tronc", date: "2026-09-28", draft }, TODAY, NOW);
    await expect(saveManualTestResult({ protocolId: "protocol-tronc", date: "2026-09-28", draft }, TODAY, NOW)).rejects.toThrow(/existe déjà/);

    await expect(
      saveManualTestResult({ protocolId: "protocol-traction_stricte", date: "2026-09-28", draft: { values: { tractions_barre: 1 } } }, TODAY, NOW),
    ).rejects.toThrow(/en pause/);
    await expect(saveManualTestResult({ protocolId: "protocol-cardio", date: "2026-09-30", draft: {} }, TODAY, NOW)).rejects.toThrow(/Aucune mesure/);
    expect(await db.testResults.count()).toBe(1);
  });
});

describe("supprimer un résultat saisi", () => {
  it("il disparaît, la version se défige ; un résultat de séance ne se supprime pas ici", async () => {
    const result = await saveManualTestResult({ protocolId: "protocol-tronc", date: "2026-09-28", draft: { values: { planche_duree_s: 70 } } }, TODAY, NOW);
    await deleteManualTestResult(result.id, NOW);

    expect(await db.testResults.count()).toBe(0);
    const version = (await db.testProtocolVersions.get("protocol-tronc-v1"))!;
    expect(version.firstOfficialResultId).toBeUndefined();
    expect(version.frozenAt).toBeUndefined();

    const fromWorkout: TestResult = {
      id: "r", protocolId: "protocol-tronc", versionId: "protocol-tronc-v1", date: "2026-10-26", origin: "workout", workoutId: "w", blockId: "b",
      status: "complete", measures: [], createdAt: NOW, updatedAt: NOW,
    };
    await db.testResults.put(fromWorkout);
    await expect(deleteManualTestResult("r", NOW)).rejects.toThrow(/avec sa séance/);
  });
});

describe("recommandations (infrastructure seulement)", () => {
  const result = { id: "r", protocolId: "protocol-traction", status: "complete" } as TestResult;

  it("registre vide : aucune recommandation", () => {
    expect(TEST_RECOMMENDATION_RULES).toEqual([]);
    expect(recommendationsFor({ key: "traction" }, result)).toEqual([]);
  });

  it("une règle déclarée s'appliquerait à son seul protocole", () => {
    const rule = { id: "x", protocolKey: "traction", applies: () => true, recommend: () => "Texte" };
    expect(recommendationsFor({ key: "traction" }, result, [rule])).toEqual(["Texte"]);
    expect(recommendationsFor({ key: "cardio" }, result, [rule])).toEqual([]);
  });
});
