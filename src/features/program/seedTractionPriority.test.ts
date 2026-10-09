import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { TRACTION_TEST_7KG_INSTRUCTIONS } from "../tests/seedTractionTest7kg";
import { PROGRAM_V2_TEMPLATES, SUSPENSION_NOTE, TRACTION_LIGHT_NOTE } from "./programV2";
import { seedTractionPriority20261003 } from "./seedTractionPriority";

/**
 * Seeds 24 et 25 (03/10/2026), priorité traction jusqu'au 31/03/2027 :
 * traction légère en premier en Muscu B, suspension en Muscu C, test
 * traction par paliers de 7 kg (version 2).
 */

const NOW = "2026-10-03T18:00:00.000Z";
const order = (template: SessionTemplate) => [...template.blocks].sort((a, b) => a.position - b.position).map((block) => block.id);

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

/**
 * Les modèles B et C tels que le seed 19 les avait installés avant le 03/10
 * (sans le rowing de volume que le programme du 05/10 ajoute à Muscu B).
 */
async function seededBeforePriority() {
  await runSeeds(SEEDS.filter((seed) => seed.name !== "tractionPriority20261003"));
  const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
  const old = ["v2-muscu-b-echauffement", "v2-muscu-b-chest-press", "v2-muscu-b-developpe-incline", "v2-muscu-b-traction", "v2-muscu-b-developpe-epaules", "v2-muscu-b-elevations", "v2-muscu-b-extension-triceps", "v2-muscu-b-presse"];
  await db.sessionTemplates.put({
    ...b,
    blocks: b.blocks
      .filter((block) => old.includes(block.id))
      .map((block) => ({ ...block, position: old.indexOf(block.id), ...(block.id === "v2-muscu-b-traction" ? { notes: "Traction légère : plus d'assistance qu'en A, à ajuster après le test." } : {}) })),
  });
  const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
  await db.sessionTemplates.put({
    ...c,
    blocks: c.blocks.filter((block) => block.id !== "v2-muscu-c-suspension").map((block) => ({ ...block, position: block.position > 1 ? block.position - 1 : block.position })),
  });
}

describe("seed 24 — priorité traction", () => {
  it("Muscu B : traction légère en premier, le reste dans le même ordre (celui du programme) ; Muscu C : suspension en premier", async () => {
    await seededBeforePriority();
    await seedTractionPriority20261003(NOW);

    const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    expect(order(b)).toEqual([
      "v2-muscu-b-echauffement", "v2-muscu-b-traction", "v2-muscu-b-chest-press", "v2-muscu-b-developpe-incline",
      "v2-muscu-b-developpe-epaules", "v2-muscu-b-elevations", "v2-muscu-b-extension-triceps", "v2-muscu-b-presse",
    ]);
    expect(b.blocks.find((block) => block.id === "v2-muscu-b-traction")).toMatchObject({ notes: TRACTION_LIGHT_NOTE });
    expect(order(c).slice(0, 4)).toEqual(["v2-muscu-c-echauffement", "v2-muscu-c-suspension", "v2-muscu-c-negatives", "v2-muscu-c-tirage-vertical"]);
    expect(c.blocks.find((block) => block.id === "v2-muscu-c-suspension")).toMatchObject({
      exerciseId: "suspension-omoplates", notes: SUSPENSION_NOTE, instructions: { shape: "duration", sets: 3, durationSec: { min: 20, max: 30 } },
    });
    /* Muscu B dans l'ordre du programme (le rowing de volume du 05/10 vient du seed 38) ; Muscu C : le seed 38 met ensuite les négatives avant la suspension. */
    const definition = PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-b")!;
    expect(order(b)).toEqual([...definition.blocks].sort((x, y) => x.position - y.position).map((block) => block.id).filter((id) => id !== "v2-muscu-b-rowing"));
    expect(((await db.settings.get("install"))!.value as InstallMarkers).tractionPriority20261003).toBe(NOW);
  });

  it("modèle modifié par l'utilisateur (autre ordre, suspension déjà là) : rien ; base neuve : déjà dans le bon ordre", async () => {
    await seededBeforePriority();
    const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const swapped = { ...b, blocks: b.blocks.map((block) => (block.id === "v2-muscu-b-presse" ? { ...block, position: 1.5 } : block)) };
    await db.sessionTemplates.put(swapped);
    await seedTractionPriority20261003(NOW);
    expect(await db.sessionTemplates.get("v2-muscu-b")).toEqual(swapped);

    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    const fresh = (await db.sessionTemplates.get("v2-muscu-c"))!;
    expect(fresh.blocks.filter((block) => block.kind === "exercise" && block.exerciseId === "suspension-omoplates")).toHaveLength(1);
  });
});

describe("seed 25 — test traction par paliers de 7 kg", () => {
  it("version 2 active, paliers de 7 kg, mêmes mesures ; la version 1 (figée par son résultat) est archivée, jamais réécrite", async () => {
    /* Sans le seed 27 (test V3 du 05/10), qui remplace ensuite la version 2. */
    await runSeeds(SEEDS.filter((seed) => seed.name !== "tractionTestV320261005"));
    const protocol = (await db.testProtocols.get("protocol-traction"))!;
    const v1 = (await db.testProtocolVersions.get("protocol-traction-v1"))!;
    const v2 = (await db.testProtocolVersions.get(protocol.activeVersionId))!;
    expect(v2).toMatchObject({ id: "protocol-traction-v2", number: 2, status: "active", instructions: TRACTION_TEST_7KG_INSTRUCTIONS, settings: { stepMinKg: 7, stepMaxKg: 7, warmupAssistKg: 56 } });
    expect(v2.measures).toEqual(v1.measures);
    expect(v1.status).toBe("archived");
    expect(v1.settings).toMatchObject({ stepMinKg: 2, stepMaxKg: 3 });
  });
});
