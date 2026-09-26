import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession, WorkoutSession } from "../../domain";
import { slotOf } from "../../domain/rules/programRules";
import { parseBackup } from "../backup/restoreBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { generateProgramWeek } from "./generateProgramWeek";
import { seedTestsWeek20260927, TESTS_WEEK_START } from "./seedTestsWeek20260927";

/**
 * Seed 17 (26/09/2026) : traction dimanche, cardio mercredi, jambes jeudi
 * sur les séances de journée de la semaine du 27/09, générées avant le
 * lot G ; seules les séances intactes sont complétées.
 */

const NOW = "2026-09-26T12:00:00.000Z";

async function week(): Promise<PlannedSession[]> {
  return (await db.plannedSessions.where("date").between("2026-09-27", "2026-10-03", true, true).toArray()).sort(
    (a, b) => a.date.localeCompare(b.date) || slotOf(a).localeCompare(slotOf(b)),
  );
}

const testsOf = (sessions: PlannedSession[]) =>
  sessions.filter((session) => (session.tests ?? []).length > 0).map((session) => [session.date, session.sessionTemplateId, session.tests!.map((test) => test.protocolId)]);

describe("seed 17 — les tests de la semaine du 27/09", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    vi.restoreAllMocks();
  });

  it("séances de journée sans tests (générées avant le lot G) : traction, cardio et jambes s'attachent ; le soir et une séance démarrée ne bougent pas", async () => {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "testsWeek20260927"));
    await generateProgramWeek(TESTS_WEEK_START, NOW);
    const expected = testsOf(await week());
    expect(expected.map(([date, , protocols]) => [date, protocols])).toEqual([
      ["2026-09-27", ["protocol-traction"]],
      ["2026-09-28", ["protocol-souplesse", "protocol-tronc"]],
      ["2026-09-30", ["protocol-cardio"]],
      ["2026-10-01", ["protocol-jambes"]],
    ]);

    /* L'état de l'iPhone : les séances de journée sans leurs tests. */
    for (const session of await week()) {
      if (slotOf(session) === "day" && session.tests) {
        const rest = { ...session };
        delete rest.tests;
        await db.plannedSessions.put(rest);
      }
    }
    /* Muscu C du jeudi déjà démarrée : laissée telle quelle. */
    const thursday = (await week()).find((session) => session.date === "2026-10-01" && slotOf(session) === "day")!;
    await db.workouts.put({ id: "w-jeudi", plannedSessionId: thursday.id, date: thursday.date, status: "in_progress" } as unknown as WorkoutSession);

    await seedTestsWeek20260927(NOW);

    expect(testsOf(await week())).toEqual(expected.filter(([date]) => date !== "2026-10-01"));
    const sunday = (await week()).find((session) => session.date === "2026-09-27" && slotOf(session) === "day")!;
    expect(sunday.tests).toEqual([
      { protocolId: "protocol-traction", placement: "after_warmup", adjustments: [{ blockId: "v1-muscu-a-traction", sets: 2 }] },
    ]);

    /* Marqueur posé : un second passage n'écrit rien. */
    const before = JSON.stringify(await week());
    await seedTestsWeek20260927("2026-09-27T12:00:00.000Z");
    expect(JSON.stringify(await week())).toBe(before);
  });

  const path = process.env.COACH_JM_BACKUP;
  it.skipIf(!path)("sauvegarde réelle : après les seeds, chaque test de la semaine du 27/09 est attaché à sa séance", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    const fileWeek = ((file.stores.plannedSessions ?? []) as PlannedSession[]).filter((session) => session.date >= "2026-09-27" && session.date <= "2026-10-03");
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await runSeeds();

    const sessions = await week();
    /* Chaque séance du fichier reste, avec au moins ses tests d'origine ; aucune n'est créée ni supprimée. */
    expect(sessions.map((session) => session.id).sort()).toEqual(fileWeek.map((session) => session.id).sort());
    for (const original of fileWeek) {
      const now = sessions.find((session) => session.id === original.id)!;
      if ((original.tests ?? []).length > 0) expect(now.tests, original.id).toEqual(original.tests);
    }
    if (fileWeek.length === 0) return;
    const protocols = sessions.flatMap((session) => (session.tests ?? []).map((test) => test.protocolId)).sort();
    const dayIntact = (date: string, template: string) =>
      fileWeek.some((session) => session.date === date && session.sessionTemplateId === template && session.status === "upcoming" && !(session.tests ?? []).length);
    if (dayIntact("2026-09-27", "v1-muscu-a")) expect(protocols).toContain("protocol-traction");
    if (dayIntact("2026-09-30", "v1-cardio-a")) expect(protocols).toContain("protocol-cardio");
    if (dayIntact("2026-10-01", "v1-muscu-c")) expect(protocols).toContain("protocol-jambes");
  });
});
