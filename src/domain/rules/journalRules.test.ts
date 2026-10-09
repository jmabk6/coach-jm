import { describe, expect, it } from "vitest";
import {
  relativeDayLabel,
  formatJournalDay,
  formatQuantity,
  formatTotalGrams,
  journalDayAfter,
  journalDayBefore,
  parseEstimateForm,
  parseQuantityInput,
  resolveJournalDate,
} from "./journalRules";

/**
 * Journal (phase 3A.2) — règles pures de l'écran : jour affiché (jamais
 * dans le futur), saisie d'une estimation, quantité, libellés.
 */

describe("jour du journal", () => {
  it("sans date : aujourd'hui ; date passée : gardée ; future ou illisible : aujourd'hui, adresse à corriger", () => {
    expect(resolveJournalDate(null, "2026-10-05")).toEqual({ date: "2026-10-05", corrected: false });
    expect(resolveJournalDate("2026-10-01", "2026-10-05")).toEqual({ date: "2026-10-01", corrected: false });
    expect(resolveJournalDate("2025-01-31", "2026-10-05")).toEqual({ date: "2025-01-31", corrected: false });
    expect(resolveJournalDate("2026-10-05", "2026-10-05")).toEqual({ date: "2026-10-05", corrected: false });
    expect(resolveJournalDate("2026-10-06", "2026-10-05")).toEqual({ date: "2026-10-05", corrected: true });
    expect(resolveJournalDate("abc", "2026-10-05")).toEqual({ date: "2026-10-05", corrected: true });
    expect(resolveJournalDate("2026-02-30", "2026-10-05")).toEqual({ date: "2026-10-05", corrected: true });
  });

  it("jour précédent toujours ; suivant jamais au-delà d'aujourd'hui ; passage de mois", () => {
    expect(journalDayBefore("2026-10-01")).toBe("2026-09-30");
    expect(journalDayAfter("2026-10-04", "2026-10-05")).toBe("2026-10-05");
    expect(journalDayAfter("2026-10-05", "2026-10-05")).toBeUndefined();
    expect(journalDayAfter("2026-09-30", "2026-10-05")).toBe("2026-10-01");
  });

  it("titre : « Lundi 5 octobre », « Jeudi 1er octobre »", () => {
    expect(formatJournalDay("2026-10-05")).toBe("Lundi 5 octobre");
    expect(formatJournalDay("2026-10-01")).toBe("Jeudi 1er octobre");
  });
});

describe("écart avec aujourd'hui, sous la date (correctif du 10/10/2026)", () => {
  it("« Aujourd'hui », « Hier », « Avant-hier », puis « Il y a N jours » — jamais « Aujourd'hui » pour un autre jour", () => {
    expect(relativeDayLabel("2026-10-10", "2026-10-10")).toBe("Aujourd'hui");
    expect(relativeDayLabel("2026-10-09", "2026-10-10")).toBe("Hier");
    expect(relativeDayLabel("2026-10-08", "2026-10-10")).toBe("Avant-hier");
    expect(relativeDayLabel("2026-10-07", "2026-10-10")).toBe("Il y a 3 jours");
    expect(relativeDayLabel("2026-09-30", "2026-10-10")).toBe("Il y a 10 jours");
    /* Changement d'heure (25/10/2026) : des jours de calendrier, pas des tranches de 24 h. */
    expect(relativeDayLabel("2026-10-24", "2026-10-26")).toBe("Avant-hier");
  });
});

describe("saisies", () => {
  it("estimation : kcal obligatoires (> 0), nom et macros facultatifs, virgule acceptée", () => {
    expect(parseEstimateForm({ name: "", kcal: "650", proteinG: "", carbsG: "", fatG: "" })).toEqual({ ok: true, nutrients: { kcal: 650 } });
    expect(parseEstimateForm({ name: " Restaurant ", kcal: "650,5", proteinG: "30", carbsG: "", fatG: "22,5" })).toEqual({
      ok: true, name: "Restaurant", nutrients: { kcal: 650.5, proteinG: 30, fatG: 22.5 },
    });
    expect(parseEstimateForm({ name: "", kcal: "", proteinG: "", carbsG: "", fatG: "" })).toEqual({ ok: false, message: "Calories estimées : obligatoires." });
    expect(parseEstimateForm({ name: "", kcal: "0", proteinG: "", carbsG: "", fatG: "" })).toEqual({ ok: false, message: "Calories estimées : supérieures à 0." });
    expect(parseEstimateForm({ name: "", kcal: "beaucoup", proteinG: "", carbsG: "", fatG: "" })).toEqual({ ok: false, message: "Calories estimées : nombre illisible." });
    expect(parseEstimateForm({ name: "", kcal: "500", proteinG: "-3", carbsG: "", fatG: "" })).toEqual({ ok: false, message: "Protéines : nombre illisible." });
    expect(parseEstimateForm({ name: "", kcal: "20000", proteinG: "", carbsG: "", fatG: "" })).toEqual({ ok: false, message: "Calories : entre 0 et 10000." });
  });

  it("quantité : virgule acceptée, strictement positive", () => {
    expect(parseQuantityInput("300")).toEqual({ ok: true, quantity: 300 });
    expect(parseQuantityInput("1,5")).toEqual({ ok: true, quantity: 1.5 });
    expect(parseQuantityInput("0")).toEqual({ ok: false, message: "Quantité : supérieure à 0." });
    expect(parseQuantityInput("")).toEqual({ ok: false, message: "Quantité : obligatoire." });
    expect(parseQuantityInput("x")).toEqual({ ok: false, message: "Quantité : nombre illisible." });
  });

  it("libellés : quantité avec unité, total de macro partiel « ≥ »", () => {
    expect(formatQuantity(250, "g")).toBe("250 g");
    expect(formatQuantity(33.3, "ml")).toBe("33,3 ml");
    expect(formatQuantity(1, "portion")).toBe("1 portion");
    expect(formatQuantity(2, "portion")).toBe("2 portions");
    expect(formatQuantity(1, "piece")).toBe("1 pièce");
    expect(formatQuantity(1.5, "piece")).toBe("1,5 pièce");
    expect(formatQuantity(3, "piece")).toBe("3 pièces");
    expect(formatTotalGrams(112.25, false)).toBe("112,3 g");
    expect(formatTotalGrams(112.25, true)).toBe("≥ 112,3 g");
  });
});
