import { describe, expect, it } from "vitest";
import { formatFr } from "./dateFr";
import { formatDayLabel, formatFullDate, formatShortDay, formatWeekRange } from "./programRules";
import { formatWeekSpan } from "./weightRules";
import { formatTestDay } from "./goalListRules";

/** « 1er » pour le premier jour du mois, partout où une date s'écrit en toutes lettres (25/09/2026). */

describe("formatFr", () => {
  it("1er le premier du mois, le nombre sinon ; seul le jeton d est touché", () => {
    expect(formatFr("2026-10-01", "d MMM")).toBe("1er oct.");
    expect(formatFr("2026-10-02", "d MMM")).toBe("2 oct.");
    expect(formatFr("2026-10-01", "dd/MM")).toBe("01/10");
    expect(formatFr("2026-10-01", "EEEE d MMMM yyyy")).toBe("jeudi 1er octobre 2026");
  });

  it("les formats de l'application", () => {
    expect(formatShortDay("2026-10-01")).toBe("jeu. 1er oct.");
    expect(formatFullDate("2026-10-01")).toBe("jeudi 1er octobre 2026");
    expect(formatDayLabel("2026-11-01").day).toBe("1er nov.");
    expect(formatWeekRange("2026-11-01")).toBe("Du 1er au 7 novembre 2026");
    expect(formatWeekRange("2026-09-27")).toBe("Du 27 septembre au 3 octobre 2026");
    expect(formatWeekSpan({ weekStart: "2026-11-01", weekEnd: "2026-11-07" })).toBe("1er → 7 nov.");
    expect(formatTestDay("2026-10-01")).toBe("1er oct.");
  });
});
