import { describe, expect, it } from "vitest";
import type { PlannedSession, TestScheduleEntry } from "../models";
import { formatTestDay, goalDueCard, goalStatusCard, nextTestDate } from "./goalListRules";

/** Lot H.3 — date du prochain test d'un objectif (M4). */

const cycle = { anchorWeekStart: "2026-09-27", everyWeeks: 6 } as const;
const schedule: TestScheduleEntry[] = [{ protocolKey: "cardio", weekday: "wednesday", slot: "day", templateId: "v1-cardio-a" }];
const base = { protocolId: "protocol-cardio", protocolKey: "cardio", schedule, cycle, results: [], sessions: [] };
const T = "2026-09-20T08:00:00.000Z";

describe("nextTestDate", () => {
  it("avant la semaine de tests : son jour dans la prochaine semaine de tests", () => {
    expect(nextTestDate({ ...base, today: "2026-09-23" })).toBe("2026-09-30");
  });

  it("pendant la semaine, jour pas encore passé : ce jour ; passé ou déjà fait : la semaine de tests suivante", () => {
    expect(nextTestDate({ ...base, today: "2026-09-29" })).toBe("2026-09-30");
    expect(nextTestDate({ ...base, today: "2026-10-01" })).toBe("2026-11-11");
    expect(nextTestDate({ ...base, today: "2026-09-29", results: [{ protocolId: "protocol-cardio", date: "2026-09-28" }] })).toBe("2026-11-11");
  });

  it("une séance à venir qui porte le test (replanifié) passe avant le calendrier", () => {
    const session: PlannedSession = {
      id: "p", date: "2026-10-03", sessionTemplateId: "v1-cardio-c", status: "upcoming", source: "manual", createdAt: T, updatedAt: T,
      tests: [{ protocolId: "protocol-cardio", placement: "after_warmup" }],
    };
    expect(nextTestDate({ ...base, sessions: [session], today: "2026-10-01" })).toBe("2026-10-03");
    expect(nextTestDate({ ...base, sessions: [{ ...session, removedAt: T }], today: "2026-10-01" })).toBe("2026-11-11");
  });

  it("formatTestDay : « 27 sept. », « 1er oct. »", () => {
    expect(formatTestDay("2026-09-27")).toBe("27 sept.");
    expect(formatTestDay("2026-10-01")).toBe("1er oct.");
  });
});

describe("cartes Statut et Échéance (M5)", () => {
  const point = { date: "2026-09-20", value: 30 };
  it("statut : « — » sans mesure ni résultat ni cible ; palier ; retard en semaines", () => {
    expect(goalStatusCard({ kind: "no_measure" }, undefined).value).toBe("—");
    expect(goalStatusCard({ kind: "no_result" }, "2026-09-27")).toEqual({ value: "—", caption: "Premier test le 27 septembre 2026" });
    expect(goalStatusCard({ kind: "reached", role: "intermediate", start: point, latest: point }, undefined).value).toBe("Palier atteint");
    expect(goalStatusCard({ kind: "reached", role: "final", start: point, latest: point }, undefined).value).toBe("Objectif atteint");
    expect(
      goalStatusCard({ kind: "tracking", start: point, latest: point, expected: 28, status: "behind", weeks: 1.5, percent: 12.4, bar: 12.4 }, undefined),
    ).toEqual({ value: "En retard de 1,5 sem.", caption: "12 % du parcours" });
    expect(goalStatusCard({ kind: "tracking", start: point, latest: point, expected: 30, status: "ahead", weeks: -2, percent: 40, bar: 40 }, undefined).value).toBe(
      "En avance de 2 sem.",
    );
  });

  it("échéance : date, mois restants, passée, à définir", () => {
    expect(goalDueCard("2027-03-31", "2026-09-24")).toEqual({ value: "31 mars 2027", caption: "6 mois restants" });
    expect(goalDueCard("2026-09-01", "2026-09-24").caption).toBe("Échéance passée");
    expect(goalDueCard(undefined, "2026-09-24").value).toBe("À définir");
  });
});
