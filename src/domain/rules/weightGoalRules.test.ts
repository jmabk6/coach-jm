import { describe, expect, it } from "vitest";
import type { BodyMeasurement } from "../models";
import { weightCurrentCard, weightEtaCard, weightGoalOverview, weightGoalRowText, weightGoalShortStatus, weightPaceCard } from "./weightGoalRules";

/**
 * Objectif Poids (15/10/2026) : départ fixe enregistré (91,15 kg le
 * 5/10/2026) ; trajectoire de −0,5 kg par semaine ; avance ou retard à la
 * date de la dernière pesée ; échéance estimée depuis la dernière pesée,
 * comparée à l'échéance de départ (même cible, même rythme, même arrondi).
 */

const measure = (id: string, date: string, weightKg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement =>
  ({ id, date, takenAt: `${date}T05:00:00.000Z`, device: "renpho", source: "manual", weightReference: true, weightKg, createdAt: "x", updatedAt: "x", ...extra }) as BodyMeasurement;

/** Tes mesures RENPHO du 5 au 15/10/2026 (sauvegarde du 15/10 à 11:19). */
const REAL: Array<[string, number]> = [
  ["2026-10-05", 91.15], ["2026-10-06", 90.3], ["2026-10-07", 89.25], ["2026-10-08", 88.65], ["2026-10-09", 88.45], ["2026-10-10", 88],
  ["2026-10-11", 88.15], ["2026-10-12", 88.15], ["2026-10-13", 88], ["2026-10-14", 87.85], ["2026-10-15", 87.75],
];
const real = () => REAL.map(([date, kg]) => measure(`m-${date}`, date, kg));
const START = { date: "2026-10-05", value: 91.15 };

describe("weightGoalOverview", () => {
  it("tes valeurs attendues (cible 75) : prévu 90,4 kg, 2,7 kg d'avance, échéance 12/04/2027, échéance de départ 20/05/2027, 5 semaines et 3 jours d'avance", () => {
    const overview = weightGoalOverview(real(), "renpho", 75, START);
    expect(overview.start).toEqual({ date: "2026-10-05", kg: 91.15 });
    expect(overview.startStored).toBe(true);
    expect(overview.current).toEqual({ date: "2026-10-15", kg: 87.75 });
    expect(overview.pace).toMatchObject({ kind: "tracking", date: "2026-10-15" });
    if (overview.pace.kind !== "tracking") return;
    expect(overview.pace.expectedKg).toBeCloseTo(91.15 - (0.5 * 10) / 7, 9);
    expect(overview.pace.gapKg).toBeCloseTo(91.15 - (0.5 * 10) / 7 - 87.75, 9);
    /* (87,75 − 75) / 0,5 × 7 = 178,5 → 179 j ; (91,15 − 75) / 0,5 × 7 = 226,1 → 227 j. */
    expect(overview.eta).toEqual({ kind: "estimate", date: "2027-04-12", days: 179, startDate: "2027-05-20", aheadDays: 38 });
  });

  it("le départ enregistré ne bouge pas : une pesée plus ancienne ajoutée ou la première supprimée ne le déplacent pas", () => {
    const older = weightGoalOverview([measure("old", "2026-10-01", 93), ...real()], "renpho", 75, START);
    expect(older.start).toEqual({ date: "2026-10-05", kg: 91.15 });
    const without = weightGoalOverview(real().slice(1), "renpho", 75, START);
    expect(without.start).toEqual({ date: "2026-10-05", kg: 91.15 });
    /* Sans départ enregistré : la première pesée, signalée comme départ provisoire. */
    const provisional = weightGoalOverview(real(), "renpho", 75, undefined);
    expect([provisional.start, provisional.startStored]).toEqual([{ date: "2026-10-05", kg: 91.15 }, false]);
  });

  it("tout suit la cible enregistrée (78) : échéance 1/03/2027, échéance de départ 8/04/2027 → 5 semaines et 3 jours d'avance", () => {
    expect(weightGoalOverview(real(), "renpho", 78, START).eta).toEqual({ kind: "estimate", date: "2027-03-01", days: 137, startDate: "2027-04-08", aheadDays: 38 });
  });

  it("objectif atteint ou dépassé : jamais de durée négative ; données manquantes : explications", () => {
    expect(weightGoalOverview([...real(), measure("z", "2026-12-01", 75)], "renpho", 75, START).eta).toEqual({ kind: "reached" });
    expect(weightGoalOverview([...real(), measure("z", "2026-12-01", 74.2)], "renpho", 75, START).eta).toEqual({ kind: "reached" });
    expect(weightGoalOverview([], "renpho", 75, START).pace).toEqual({ kind: "no_weight" });
    expect(weightGoalOverview(real(), "renpho", undefined, START).eta).toEqual({ kind: "no_target" });
    expect(weightGoalOverview([measure("a", "2026-10-05", 91.15)], "renpho", 75, undefined).pace).toEqual({ kind: "first_weight", start: { date: "2026-10-05", kg: 91.15 } });
  });

  it("même source que « Composition corporelle » : jamais un autre appareil ni la copie d'une pesée", () => {
    const measures = [...real(), measure("w", "2026-10-16", 70, { device: "withings", weightReference: false }), measure("c", "2026-10-17", 60, { originWeightEntry: { id: "x" } as never })];
    expect(weightGoalOverview(measures, "renpho", 75, START).current).toEqual({ date: "2026-10-15", kg: 87.75 });
  });
});

describe("cartes", () => {
  const overview = () => weightGoalOverview(real(), "renpho", 75, START);

  it("Poids actuel : 87,75 kg, 15 octobre 2026, −3,4 kg depuis le 5 oct.", () => {
    expect(weightCurrentCard(overview())).toEqual({ value: "87,75 kg", sub: "15 octobre 2026", highlight: "−3,4 kg", tone: "good", foot: "Depuis le 5 oct." });
    expect(weightCurrentCard(weightGoalOverview([], "renpho", 75, START))).toEqual({ value: "—", sub: "Aucune pesée RENPHO pour l'instant" });
  });

  it("Trajectoire : « 2,7 kg » « d'avance », « Prévu : 90,4 kg », « Au 15 octobre » ; retard ; sur la trajectoire", () => {
    expect(weightPaceCard(overview())).toEqual({ value: "2,7 kg", sub: "d'avance", tone: "good", highlight: "Prévu : 90,4 kg", foot: "Au 15 octobre" });
    const late = weightGoalOverview([measure("a", "2026-10-05", 91.15), measure("b", "2026-10-19", 90.55)], "renpho", 75, START);
    expect(weightPaceCard(late)).toEqual({ value: "0,4 kg", sub: "de retard", tone: "bad", highlight: "Prévu : 90,2 kg", foot: "Au 19 octobre" });
    const onLine = weightGoalOverview([measure("a", "2026-10-05", 91.15), measure("b", "2026-10-19", 90.17)], "renpho", 75, START);
    expect(weightPaceCard(onLine)).toEqual({ value: "Sur la trajectoire", highlight: "Prévu : 90,2 kg", foot: "Au 19 octobre" });
  });

  it("Échéance estimée : 12 avril 2027, Rythme : −0,5 kg/sem., 5 sem. et 3 j d'avance, Départ : 20 mai 2027", () => {
    expect(weightEtaCard(overview())).toEqual({ value: "12 avril 2027", sub: "Rythme : −0,5 kg/sem.", highlight: "5 sem. et 3 j d'avance", tone: "good", foot: "Départ : 20 mai 2027" });
  });

  it("Échéance : retard, échéance inchangée, objectif atteint, cible à définir", () => {
    const late = weightGoalOverview([measure("a", "2026-10-05", 91.15), measure("b", "2026-10-26", 91)], "renpho", 75, START);
    expect(weightEtaCard(late)).toMatchObject({ highlight: "2 sem. et 4 j de retard", tone: "bad", foot: "Départ : 20 mai 2027" });
    const same = weightGoalOverview([measure("a", "2026-10-05", 91.15), measure("b", "2026-10-19", 90.15)], "renpho", 75, START);
    expect(weightEtaCard(same)).toMatchObject({ value: "20 mai 2027", highlight: "Échéance inchangée", tone: "neutral" });
    expect(weightEtaCard(weightGoalOverview([...real(), measure("z", "2026-12-01", 74.2)], "renpho", 75, START))).toEqual({ value: "Objectif atteint", sub: "74,2 kg le 1er décembre 2026" });
    expect(weightEtaCard(weightGoalOverview(real(), "renpho", undefined, START))).toEqual({ value: "—", sub: "Objectif à définir" });
  });

  it("explications : pas de pesée, une seule pesée, départ provisoire", () => {
    expect(weightPaceCard(weightGoalOverview([], "renpho", 75, START))).toEqual({ value: "—", sub: "Pas encore de pesée RENPHO" });
    expect(weightPaceCard(weightGoalOverview([measure("a", "2026-10-05", 91.15)], "renpho", 75, undefined))).toEqual({
      value: "Départ",
      sub: "91,15 kg le 5 oct.",
      foot: "L'écart se calcule dès la 2e pesée",
    });
    expect(weightCurrentCard(weightGoalOverview(real(), "renpho", 75, undefined)).foot).toBe("Depuis le 5 oct. (départ provisoire)");
  });
});

describe("liste des objectifs et Accueil : les mêmes calculs", () => {
  it("ligne : « 87,75 kg · 2,7 kg d'avance », objectif 75 kg, barre (91,15 − 87,75) / (91,15 − 75) = 21 % ; statut « En avance »", () => {
    const overview = weightGoalOverview(real(), "renpho", 75, START);
    expect(weightGoalRowText(overview)).toEqual({ subtitle: "Trajectoire −0,5 kg/semaine", value: "87,75 kg · 2,7 kg d'avance", target: "Objectif : 75 kg", bar: 21 });
    expect(weightGoalShortStatus(overview)).toEqual({ label: "En avance", tone: "ahead" });
  });

  it("retard, sur la trajectoire, objectif atteint, sans données : jamais un statut favorable par défaut", () => {
    const late = weightGoalOverview([measure("a", "2026-10-05", 91.15), measure("b", "2026-10-19", 90.55)], "renpho", 75, START);
    expect(weightGoalShortStatus(late)).toEqual({ label: "En retard", tone: "behind" });
    const onLine = weightGoalOverview([measure("a", "2026-10-05", 91.15), measure("b", "2026-10-19", 90.17)], "renpho", 75, START);
    expect(weightGoalShortStatus(onLine)).toEqual({ label: "Sur la trajectoire", tone: "on_track" });
    const reached = weightGoalOverview([...real(), measure("z", "2026-12-01", 74.2)], "renpho", 75, START);
    expect(weightGoalShortStatus(reached)).toEqual({ label: "Atteint", tone: "reached" });
    expect(weightGoalRowText(reached)).toMatchObject({ reached: "Objectif atteint", bar: 100 });
    const empty = weightGoalOverview([], "renpho", 75, START);
    expect(weightGoalShortStatus(empty)).toBeUndefined();
    expect(weightGoalRowText(empty)).toEqual({ subtitle: "Trajectoire −0,5 kg/semaine", value: "Pas encore de pesée RENPHO", target: "Objectif : 75 kg", bar: 0 });
  });
});
