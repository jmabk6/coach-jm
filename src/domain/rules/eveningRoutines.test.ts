import { describe, expect, it } from "vitest";
import type { PlannedSession } from "../models";
import { generateEveningRoutines } from "./testCycleRules";

/** Lot K.2 — une routine chaque soir, en rotation A / B / C qui suit les jours (N3). */

const program = { eveningRotation: ["v1-routine-a", "v1-routine-b", "v1-routine-c"], eveningRotationAnchor: "2026-09-27" };
const NOW = "2026-09-25T10:00:00.000Z";
const letters = (sessions: PlannedSession[]) => sessions.map((session) => session.sessionTemplateId.slice(-1)).join("");

describe("generateEveningRoutines", () => {
  it("chaque soir de la semaine, la rotation continue d'une semaine à l'autre", () => {
    const first = generateEveningRoutines({ program, weekStartDate: "2026-09-27", existingSessions: [], now: NOW });
    const second = generateEveningRoutines({ program, weekStartDate: "2026-10-04", existingSessions: [], now: NOW });
    expect(letters(first)).toBe("abcabca");
    expect(letters(second)).toBe("bcabcab");
    expect(first[0]).toMatchObject({ id: "weekly-2026-09-27-evening", slot: "evening", sourceWeekday: "sunday", sourceDate: "2026-09-27", status: "upcoming" });
  });

  it("une routine sautée ou déplacée : pas régénérée, les autres soirs gardent leur routine", () => {
    const [sunday, monday] = generateEveningRoutines({ program, weekStartDate: "2026-09-27", existingSessions: [], now: NOW });
    const skipped = { ...sunday!, status: "skipped" as const };
    const moved = { ...monday!, date: "2026-10-01" };
    const again = generateEveningRoutines({ program, weekStartDate: "2026-09-27", existingSessions: [skipped, moved], now: NOW });
    expect(again.map((session) => session.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(letters(again)).toBe("cabca");
  });

  it("semaine en cours ou passée : rien ; sans rotation : rien", () => {
    expect(generateEveningRoutines({ program, weekStartDate: "2026-09-20", existingSessions: [], now: NOW })).toEqual([]);
    expect(generateEveningRoutines({ program: {}, weekStartDate: "2026-09-27", existingSessions: [], now: NOW })).toEqual([]);
  });
});
