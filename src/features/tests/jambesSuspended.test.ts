import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, TestScheduleEntry } from "../../domain";
import { nextTestDate } from "../../domain/rules/goalListRules";
import { slotOf } from "../../domain/rules/programRules";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { seedJambesSuspended20261005 } from "./seedJambesSuspended";

/**
 * Pari traction V6 (05/10/2026) : le test jambes n'est pas planifié du
 * 05/10/2026 au 31/03/2027 — ni gardé, ni allégé. Le protocole et son
 * historique restent ; il revient seul à la semaine de tests du 11/04/2027.
 */

const NOW = "2026-10-05T08:00:00.000Z";
const dayOn = async (date: string) => (await db.plannedSessions.where("date").equals(date).toArray()).find((session) => slotOf(session) === "day");

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("test jambes non planifié pendant le pari V6", () => {
  it("installation neuve : aucun test jambes les jeudis 29/10, 26/11, 24/12, 21/01, 18/02, 18/03 ; les autres tests restent ; il revient le 15/04/2027", async () => {
    await runSeeds();
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "jambes")).toMatchObject({ suspendedFrom: "2026-10-04", suspendedUntil: "2027-03-31", targetBlockId: "v2-muscu-c-sprints" });
    expect(await db.testProtocols.where("key").equals("jambes").first()).toMatchObject({ status: "active" });

    for (const [sunday, thursday] of [["2026-10-25", "2026-10-29"], ["2026-11-22", "2026-11-26"], ["2026-12-20", "2026-12-24"], ["2027-01-17", "2027-01-21"], ["2027-02-14", "2027-02-18"], ["2027-03-14", "2027-03-18"]]) {
      await generateProgramWeek(sunday!, NOW);
      const muscuC = (await dayOn(thursday!))!;
      expect(muscuC.sessionTemplateId, thursday).toBe("v2-muscu-c");
      expect(muscuC.tests ?? [], thursday).toEqual([]);
      expect((await dayOn(sunday!))!.tests?.map((test) => test.protocolId), sunday).toEqual(["protocol-traction"]);
    }
    expect((await dayOn("2026-10-28"))!.tests?.map((test) => test.protocolId)).toEqual(["protocol-cardio"]);

    await generateProgramWeek("2027-04-11", NOW);
    expect((await dayOn("2027-04-15"))!.tests?.map((test) => test.protocolId)).toEqual(["protocol-jambes"]);

    const cycle = (await db.settings.get("testCycle"))!.value as { anchorWeekStart: string; everyWeeks: number };
    const sessions = await db.plannedSessions.toArray();
    expect(nextTestDate({ protocolId: "protocol-jambes", protocolKey: "jambes", sessions: sessions.filter((s) => s.date < "2027-04-11"), schedule, cycle, results: [], today: "2026-10-05" })).toBe("2027-04-15");
    expect(nextTestDate({ protocolId: "protocol-jambes", protocolKey: "jambes", sessions: [], schedule, cycle, results: [], today: "2026-10-29" })).toBe("2027-04-15");
    expect(nextTestDate({ protocolId: "protocol-traction", protocolKey: "traction", sessions: [], schedule, cycle, results: [], today: "2026-10-05" })).toBe("2026-10-25");
  });

  it("base d'avant : calendrier suspendu, le test du 29/10 déjà généré retiré, l'historique intact ; second passage : rien", async () => {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "jambesSuspended20261005"));
    /* Le calendrier d'avant le 05/10 : l'entrée jambes sans suspension. */
    const before = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    await db.settings.put({ key: "testSchedule", value: before.map((entry) => {
      const copy = { ...entry };
      delete copy.suspendedFrom;
      delete copy.suspendedUntil;
      return copy;
    }) });
    await generateProgramWeek("2026-10-25", NOW);
    const thursday = (await dayOn("2026-10-29"))!;
    expect(thursday.tests?.map((test) => test.protocolId)).toEqual(["protocol-jambes"]);
    const done: PlannedSession = { ...thursday, id: "p-2026-10-01", date: "2026-10-01", status: "done" };
    /* Une séance à venir d'avant le pari (le jeudi 01/10) garde son test. */
    const earlier: PlannedSession = { ...thursday, id: "p-2026-10-01-b", date: "2026-10-01", status: "upcoming" };
    await db.plannedSessions.bulkPut([done, earlier]);
    const resultsBefore = await db.testResults.count();

    await seedJambesSuspended20261005(NOW);

    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "jambes")?.suspendedUntil).toBe("2027-03-31");
    expect((await dayOn("2026-10-29"))!.tests).toBeUndefined();
    expect((await db.plannedSessions.get("p-2026-10-01"))!.tests?.map((test) => test.protocolId)).toEqual(["protocol-jambes"]);
    expect((await db.plannedSessions.get("p-2026-10-01-b"))!.tests?.map((test) => test.protocolId)).toEqual(["protocol-jambes"]);
    expect(await db.testResults.count()).toBe(resultsBefore);
    expect(await db.testProtocols.where("key").equals("jambes").first()).toMatchObject({ status: "active" });
    expect(((await db.settings.get("install"))!.value as InstallMarkers).jambesSuspended20261005).toBe(NOW);

    await seedJambesSuspended20261005("2026-10-06T08:00:00.000Z");
    expect(((await db.settings.get("install"))!.value as InstallMarkers).jambesSuspended20261005).toBe(NOW);
  });
});
