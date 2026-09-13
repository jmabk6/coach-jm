import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlannedSession,
  WeeklyProgram,
} from "../../domain";

const {
  getWeeklyProgram,
  getPlannedSessionsByDateIncludingRemoved,
  savePlannedSessions,
} = vi.hoisted(() => ({
  getWeeklyProgram: vi.fn(),
  getPlannedSessionsByDateIncludingRemoved: vi.fn(),
  savePlannedSessions: vi.fn(),
}));

vi.mock("../../db/repositories/programRepository", () => ({
  getWeeklyProgram,
  getPlannedSessionsByDateIncludingRemoved,
  savePlannedSessions,
}));

import { generateProgramWeek } from "./generateProgramWeek";

const program: WeeklyProgram = {
  id: "weekly-program",
  name: "Programme",
  days: [
    {
      weekday: "monday",
      sessionTemplateId: "muscu-a",
    },
    {
      weekday: "wednesday",
      sessionTemplateId: "cardio-a",
    },
  ],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("generateProgramWeek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne génère rien s'il n'existe aucun programme hebdomadaire", async () => {
    getWeeklyProgram.mockResolvedValue(undefined);

    const result = await generateProgramWeek(
      "2026-09-14",
      "2026-09-13T10:00:00.000Z",
    );

    expect(result).toEqual([]);
    expect(getPlannedSessionsByDateIncludingRemoved).not.toHaveBeenCalled();
    expect(savePlannedSessions).not.toHaveBeenCalled();
  });

  it("lit les 7 jours, génère les occurrences manquantes et les sauvegarde", async () => {
    getWeeklyProgram.mockResolvedValue(program);
    getPlannedSessionsByDateIncludingRemoved.mockResolvedValue([]);

    const result = await generateProgramWeek(
      "2026-09-14",
      "2026-09-13T10:00:00.000Z",
    );

    expect(getPlannedSessionsByDateIncludingRemoved).toHaveBeenCalledTimes(7);

    expect(
      getPlannedSessionsByDateIncludingRemoved.mock.calls.map(
        ([date]) => date,
      ),
    ).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);

    expect(result.map((session: PlannedSession) => session.date)).toEqual([
      "2026-09-14",
      "2026-09-16",
    ]);

    expect(savePlannedSessions).toHaveBeenCalledTimes(1);
    expect(savePlannedSessions).toHaveBeenCalledWith(result);
  });
});