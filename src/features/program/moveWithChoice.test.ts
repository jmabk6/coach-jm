import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession } from "../../domain";
import {
  allowedMoveChoices,
  findMoveConflict,
  formatMoveConfirmLabel,
} from "../../domain/rules/programRules";
import { moveWithChoice } from "./plannedSessionActions";

/**
 * Lot F.2 — Déplacer avec conflit (conception V2 § 2.7) : Échanger / Faire
 * les deux / Remplacer ; une cible faite ou en cours n'admet que « Faire
 * les deux » ; les tests d'une instance la suivent à l'échange (lot G).
 */

const T = "2026-09-01T08:00:00.000Z";
const NOW = "2026-09-24T10:00:00.000Z";
const testTraction = { protocolId: "traction_assistee", placement: "after_warmup" as const };

const planned = (id: string, date: string, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  id, date, sessionTemplateId: `tpl-${id}`, status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T, ...extra,
});

describe("règles pures", () => {
  const moving = planned("a", "2026-09-23");

  it("conflit : même jour et même créneau, instance visible", () => {
    const sessions = [
      planned("b", "2026-09-24"),
      planned("soir", "2026-09-25", { slot: "evening" }),
      planned("retiree", "2026-09-26", { removedAt: T }),
    ];
    expect(findMoveConflict(moving, "2026-09-24", sessions)?.id).toBe("b");
    expect(findMoveConflict(moving, "2026-09-25", sessions)).toBeUndefined();
    expect(findMoveConflict(moving, "2026-09-26", sessions)).toBeUndefined();
    expect(findMoveConflict({ ...moving, slot: "evening" }, "2026-09-25", sessions)?.id).toBe("soir");
  });

  it("cible faite ou en cours : seul « Faire les deux »", () => {
    expect(allowedMoveChoices(planned("b", "x"))).toEqual(["swap", "both", "replace"]);
    expect(allowedMoveChoices(planned("b", "x", { status: "skipped" }))).toEqual(["swap", "both", "replace"]);
    expect(allowedMoveChoices(planned("b", "x", { status: "done" }))).toEqual(["both"]);
    expect(allowedMoveChoices(planned("b", "x", { status: "in_progress" }))).toEqual(["both"]);
  });

  it("le bouton du bas reprend le choix fait", () => {
    expect(formatMoveConfirmLabel("2026-09-24", undefined, undefined)).toBe("Déplacer sur jeu. 24 sept.");
    expect(formatMoveConfirmLabel("2026-09-24", "Muscu C", undefined)).toBe("Choisissez que faire");
    expect(formatMoveConfirmLabel("2026-09-24", "Muscu C", "swap")).toBe("Échanger avec Muscu C");
    expect(formatMoveConfirmLabel("2026-09-24", "Muscu C", "both")).toBe("Faire les deux le jeu. 24 sept.");
    expect(formatMoveConfirmLabel("2026-09-24", "Muscu C", "replace")).toBe("Remplacer Muscu C");
  });
});

describe("moveWithChoice", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.plannedSessions.bulkPut([
      planned("cardio-a", "2026-09-23", { tests: [testTraction] }),
      planned("muscu-c", "2026-09-24", { tests: [{ protocolId: "jambes", placement: "before_all" }] }),
      planned("routine", "2026-09-24", { slot: "evening" }),
    ]);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  const get = async (id: string) => (await db.plannedSessions.get(id))!;

  it("sans conflit : la séance change de jour, la date d'origine de la règle reste figée", async () => {
    await db.plannedSessions.update("cardio-a", { sourceDate: "2026-09-23" });
    await moveWithChoice("cardio-a", "2026-09-25", undefined, NOW);
    expect((await get("cardio-a")).date).toBe("2026-09-25");
    expect((await get("cardio-a")).sourceDate).toBe("2026-09-23");
  });

  it("avec conflit, sans choix : refusé, rien ne bouge", async () => {
    await expect(moveWithChoice("cardio-a", "2026-09-24", undefined, NOW)).rejects.toThrow(/choisissez/);
    expect((await get("cardio-a")).date).toBe("2026-09-23");
  });

  it("Échanger : les dates s'échangent, chaque instance emporte ses tests ; la routine du soir ne bouge pas", async () => {
    await moveWithChoice("cardio-a", "2026-09-24", "swap", NOW);

    const [cardio, muscu, routine] = await Promise.all([get("cardio-a"), get("muscu-c"), get("routine")]);
    expect([cardio.date, cardio.tests]).toEqual(["2026-09-24", [testTraction]]);
    expect([muscu.date, muscu.tests?.[0]?.protocolId]).toEqual(["2026-09-23", "jambes"]);
    expect(routine.date).toBe("2026-09-24");
  });

  it("Faire les deux : les deux séances coexistent", async () => {
    await moveWithChoice("cardio-a", "2026-09-24", "both", NOW);
    expect((await get("cardio-a")).date).toBe("2026-09-24");
    expect((await get("muscu-c")).date).toBe("2026-09-24");
    expect((await get("muscu-c")).removedAt).toBeUndefined();
  });

  it("Remplacer : la séance visée est retirée, ses tests restent attachés (à replanifier, D26)", async () => {
    await moveWithChoice("cardio-a", "2026-09-24", "replace", NOW);
    const muscu = await get("muscu-c");
    expect((await get("cardio-a")).date).toBe("2026-09-24");
    expect(muscu.removedAt).toBe(NOW);
    expect(muscu.tests?.[0]?.protocolId).toBe("jambes");
  });

  it("cible faite ou en cours : Échanger et Remplacer refusés, Faire les deux permis", async () => {
    for (const status of ["done", "in_progress"] as const) {
      await db.plannedSessions.update("muscu-c", { status });
      await expect(moveWithChoice("cardio-a", "2026-09-24", "swap", NOW)).rejects.toThrow(/jamais échangée ni remplacée/);
      await expect(moveWithChoice("cardio-a", "2026-09-24", "replace", NOW)).rejects.toThrow(/jamais échangée ni remplacée/);
      expect((await get("muscu-c")).date).toBe("2026-09-24");
      expect((await get("muscu-c")).removedAt).toBeUndefined();
    }
    await moveWithChoice("cardio-a", "2026-09-24", "both", NOW);
    expect((await get("cardio-a")).date).toBe("2026-09-24");
  });

  it("une séance faite ou en cours ne se déplace pas", async () => {
    await db.plannedSessions.update("cardio-a", { status: "done" });
    await expect(moveWithChoice("cardio-a", "2026-09-25", undefined, NOW)).rejects.toThrow(/ne peut pas être déplacée/);
  });
});
