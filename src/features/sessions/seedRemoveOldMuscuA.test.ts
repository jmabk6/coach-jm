import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession, SessionTemplate } from "../../domain";
import { OLD_MUSCU_A_ID, seedRemoveOldMuscuA } from "./seedRemoveOldMuscuA";

/** Seed 18 (26/09/2026) : l'ancien « Muscu A » du 17/09, supprimé s'il est inutilisé. */

const NOW = "2026-09-26T12:00:00.000Z";
const OLD: SessionTemplate = {
  id: OLD_MUSCU_A_ID,
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [],
  createdAt: "2026-09-17T13:49:47.792Z",
  updatedAt: "2026-09-17T13:50:24.649Z",
};

describe("seed 18 — l'ancien Muscu A", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.settings.put({ key: "install", value: {} });
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("inutilisé : supprimé ; les autres modèles restent ; le marqueur est posé", async () => {
    await db.sessionTemplates.bulkPut([OLD, { ...OLD, id: "v1-muscu-a", name: "Muscu A — Traction force / dos" }]);
    await seedRemoveOldMuscuA(NOW);
    expect(await db.sessionTemplates.get(OLD_MUSCU_A_ID)).toBeUndefined();
    expect(await db.sessionTemplates.get("v1-muscu-a")).toBeDefined();
    expect(((await db.settings.get("install"))?.value as { removeOldMuscuA?: string }).removeOldMuscuA).toBe(NOW);
  });

  it("planifié entre-temps : laissé tel quel", async () => {
    await db.sessionTemplates.put(OLD);
    await db.plannedSessions.put({ id: "p1", date: "2026-09-29", sessionTemplateId: OLD_MUSCU_A_ID, status: "upcoming" } as PlannedSession);
    await seedRemoveOldMuscuA(NOW);
    expect(await db.sessionTemplates.get(OLD_MUSCU_A_ID)).toEqual(OLD);
  });
});
