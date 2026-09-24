import { describe, expect, it } from "vitest";
import type { TestProtocolVersion, TestTrial } from "../models";
import { TEST_PROTOCOLS_V1 } from "../../features/tests/testProtocolsV1";
import { computeTestResult, primaryValue } from "./testResultRules";

/**
 * Lot G.4 — mesures dérivées d'un test (conception V2 § 5.3, D28, N9),
 * calculées en direct et figées à l'enregistrement.
 */

function version(key: string, settings?: Record<string, number | string>): TestProtocolVersion {
  const content = TEST_PROTOCOLS_V1.find((item) => item.key === key)!;
  return {
    ...structuredClone(content.version),
    ...(settings ? { settings: { ...content.version.settings, ...settings } } : {}),
    id: `protocol-${key}-v1`, protocolId: `protocol-${key}`, number: 1, status: "active", createdAt: "x", updatedAt: "x",
  };
}

const trial = (order: number, value: number, outcome: TestTrial["outcome"]): TestTrial => ({ order, value, outcome, completedAt: "x" });
const valueOf = (result: ReturnType<typeof computeTestResult>, key: string) => result.measures.find((measure) => measure.key === key)?.value;

describe("traction (essais dégressifs)", () => {
  const traction = version("traction");

  it("assistance minimale = dernier essai réussi ; nombre d'essais ; complet jusqu'au premier échec", () => {
    const result = computeTestResult(traction, { trials: [trial(1, 40, "success"), trial(2, 37, "success"), trial(3, 34, "failure")] });
    expect(result.status).toBe("complete");
    expect(valueOf(result, "assistance_min_kg")).toBe(37);
    expect(valueOf(result, "essais_nb")).toBe(3);
    expect(primaryValue(traction, result.measures)).toBe(37);
  });

  it("aucun essai réussi : mesure absente, incomplet, « recalibrer le premier essai »", () => {
    const result = computeTestResult(traction, { trials: [trial(1, 40, "failure")] });
    expect(result.status).toBe("incomplete");
    expect(valueOf(result, "assistance_min_kg")).toBeUndefined();
    expect(result.messages).toContain("Aucun essai réussi : recalibrer le premier essai");
  });

  it("un seul essai réussi : le test n'est pas allé jusqu'au premier échec", () => {
    const result = computeTestResult(traction, { trials: [trial(1, 40, "success")] });
    expect(result.status).toBe("incomplete");
    expect(valueOf(result, "assistance_min_kg")).toBe(40);
    expect(result.messages).toContain("Le test va jusqu'au premier échec, ou jusqu'à une réussite au réglage le plus bas");
  });

  it("réussi au réglage le plus bas de la machine : complet, même sans échec", () => {
    const lowest = { ...trial(3, 5, "success"), atLowestSetting: true as const };
    const result = computeTestResult(traction, { trials: [trial(1, 10, "success"), trial(2, 7, "success"), lowest] });
    expect(result.status).toBe("complete");
    expect(valueOf(result, "assistance_min_kg")).toBe(5);
    expect(result.messages).toEqual([]);

    /* Un échec au réglage le plus bas reste un échec : c'est l'essai d'avant qui compte. */
    const failed = computeTestResult(traction, { trials: [trial(1, 7, "success"), { ...trial(2, 5, "failure"), atLowestSetting: true }] });
    expect(failed.status).toBe("complete");
    expect(valueOf(failed, "assistance_min_kg")).toBe(7);
  });

  it("aucun essai : incomplet", () => {
    expect(computeTestResult(traction, undefined)).toMatchObject({ status: "incomplete", measures: [], messages: expect.arrayContaining(["Aucun essai"]) });
  });
});

describe("cardio (D28, N9)", () => {
  const cardio = version("cardio");
  const fc = { fc_16: 128, fc_17: 131, fc_18: 133, fc_19: 134, fc_20: 136 };

  it("moyenne 16-20 arrondie à l'unité ; les relevés facultatifs n'empêchent rien", () => {
    const result = computeTestResult(cardio, { values: { ...fc, fc_max: 141 } });
    expect(result.status).toBe("complete");
    expect(valueOf(result, "fc_moy_16_20")).toBe(132);
    expect(valueOf(result, "fc_max")).toBe(141);
  });

  it("un relevé manquant : pas de moyenne, incomplet (N9)", () => {
    const four = { fc_16: fc.fc_16, fc_17: fc.fc_17, fc_19: fc.fc_19, fc_20: fc.fc_20 };
    const result = computeTestResult(cardio, { values: four });
    expect(result.status).toBe("incomplete");
    expect(valueOf(result, "fc_moy_16_20")).toBeUndefined();
    expect(result.messages).toContain("FC incomplète : les 5 relevés de la 16e à la 20e minute sont nécessaires");
  });
});

describe("jambes (D17)", () => {
  const sprints = { sprint_1: 620, sprint_2: 610, sprint_3: 600, sprint_4: 590, sprint_5: 575, sprint_6: 560 };

  it("moyenne des sprints, baisse du 1er au 6e à 0,1 près, dans l'unité de la version", () => {
    const result = computeTestResult(version("jambes", { unit: "watts" }), { values: { ...sprints, chaise_duree_s: 95, resistance: 8 } });
    expect(result.status).toBe("complete");
    expect(valueOf(result, "sprint_puissance_moy")).toBe(592.5);
    expect(valueOf(result, "sprint_baisse_pct")).toBe(9.7);
    expect(result.measures.find((measure) => measure.key === "sprint_1")?.unit).toBe("W");
  });

  it("unité pas encore fixée : incomplet", () => {
    const result = computeTestResult(version("jambes"), { values: { ...sprints, chaise_duree_s: 95, resistance: 8 } });
    expect(result.status).toBe("incomplete");
    expect(result.messages).toContain("Unité des sprints à choisir (watts ou mètres)");
  });
});

describe("souplesse, mensurations, tronc", () => {
  it("doigts-sol signé ; Apley par côté, les deux côtés requis ; valeur comparée = le côté le moins bon", () => {
    const souplesse = version("souplesse");
    const partial = computeTestResult(souplesse, { values: { doigts_sol_cm: -4, papillon_cm: 18 }, sideValues: { apley_cm: { left: 6 } } });
    expect(partial.status).toBe("incomplete");
    expect(partial.messages).toContain("Mains dans le dos : les deux côtés sont nécessaires");

    const full = computeTestResult(souplesse, { values: { doigts_sol_cm: -4, papillon_cm: 18 }, sideValues: { apley_cm: { left: 6, right: 11 } } });
    expect(full.status).toBe("complete");
    expect(full.measures.filter((measure) => measure.key === "apley_cm")).toEqual([
      { key: "apley_cm", value: 6, unit: "cm", side: "left" },
      { key: "apley_cm", value: 11, unit: "cm", side: "right" },
    ]);
    expect(primaryValue(souplesse, full.measures)).toBe(-4);
    expect(primaryValue({ ...souplesse, primaryMeasureKey: "apley_cm" }, full.measures)).toBe(11);
  });

  it("rapport épaules / taille à 0,01 près ; planche en secondes", () => {
    expect(valueOf(computeTestResult(version("mensurations"), { values: { epaules_cm: 118, taille_cm: 92 } }), "ratio_epaules_taille")).toBe(1.28);
    expect(computeTestResult(version("tronc"), { values: { planche_duree_s: 75 } })).toMatchObject({
      status: "complete",
      measures: [{ key: "planche_duree_s", value: 75, unit: "s" }],
    });
  });
});
