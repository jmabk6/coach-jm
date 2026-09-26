import { describe, expect, it } from "vitest";
import type { PerformedSeries, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { exerciseCatalog } from "./exerciseCatalog";
import { buildExercisePerformanceHistory, buildExercisePerformanceSummary } from "./exercisePerformance";
import {
  bestSeriesOf,
  cardioRowsOf,
  chartSpecOf,
  frameRuleSentence,
  headerTagsOf,
  nextSessionOf,
  sentencesOf,
  sessionRowsOf,
} from "./exerciseSheet";

/** Refonte de la fiche exercice (26/09/2026) : le contenu, fonctions pures. */

const T = "2026-09-20T10:00:00.000Z";
const byId = (id: string) => exerciseCatalog.find((exercise) => exercise.id === id)!;

function version(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
    id: "v1", frameId: "f1", number: 1, status: "active", progressionType: "charge_croissante", workSets: 3,
    repRange: { min: 12, max: 15 }, rpeTarget: 8, restSec: 90, increment: { unit: "kg", value: 2.5 }, createdAt: T, updatedAt: T, ...overrides,
  };
}

const series = (kg: number, reps: number, rpe?: number): PerformedSeries => ({
  id: `s-${kg}-${reps}`, position: 0, status: "completed", load: { kind: "total", kg }, reps, ...(rpe !== undefined ? { rpe } : {}),
});

function workout(id: string, date: string, exerciseId: string, items: PerformedSeries[]): WorkoutSession {
  return {
    id, date, startedAt: `${date}T08:00:00.000Z`, status: "completed", source: "free", activeDurationSec: 0, lastActionAt: T, createdAt: T, updatedAt: T,
    blocks: [{ id: `b-${id}`, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId, status: "performed", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 }, series: items }],
  } as WorkoutSession;
}

describe("prochaine séance", () => {
  it("assistance : la charge conseillée par le cadre, sa prescription et sa règle", () => {
    const assisted = version({ progressionType: "assistance_decroissante", repRange: { min: 6, max: 8 }, restSec: 150, currentTarget: { value: 52, unit: "kg", acceptedAt: T } });
    delete assisted.increment;
    expect(nextSessionOf(byId("traction-assistee"), assisted, [series(49, 8)])).toEqual({
      headline: "52 kg d'assistance",
      details: "3 × 6–8 · RPE ≤ 8 · repos 2 min 30",
      rule: "Un cran d'aide en moins quand tu réussis 3 × 8 à RPE ≤ 8.",
      toFind: false,
    });
  });

  it("cadre sans cible ni séance : « Charge à trouver » ; sans cadre ni séance : rien", () => {
    expect(nextSessionOf(byId("face-pull"), version(), undefined)).toEqual({
      headline: "Charge à trouver",
      details: "Légère, pour 3 × 12–15 à RPE 8. Repos 1 min 30.",
      rule: "+ 2,5 kg quand toutes les séries atteignent 15 répétitions à RPE ≤ 8.",
      toFind: true,
    });
    expect(nextSessionOf(byId("face-pull"), undefined, undefined)).toBeUndefined();
    expect(nextSessionOf(byId("face-pull"), undefined, [series(20, 12)])?.headline).toBe("20 kg");
  });

  it("règle en une phrase selon le type de cadre", () => {
    expect(frameRuleSentence(version())).toBe("+ 2,5 kg quand toutes les séries atteignent 15 répétitions à RPE ≤ 8.");
  });
});

describe("dernières séances, graphique, meilleure série", () => {
  const traction = byId("traction-assistee");
  const workouts = [
    workout("w1", "2026-09-15", "traction-assistee", [series(49, 10), series(49, 6), series(56, 10)]),
    workout("w2", "2026-09-25", "traction-assistee", [series(49, 8, 8), series(49, 8, 8), series(49, 8, 9)]),
  ];
  const history = buildExercisePerformanceHistory(traction, workouts);

  it("toutes les séances, la plus récente d'abord, séries et RPE réels", () => {
    expect(sessionRowsOf(history).map(({ date, load, reps, rpe }) => [date, load, reps, rpe])).toEqual([
      ["25 sept.", "49 kg", "8 / 8 / 8", "RPE 8-8-9"],
      ["15 sept.", "49 / 49 / 56 kg", "10 / 6 / 10", "—"],
    ]);
  });

  it("assistance : axe inversé ; meilleure série avec sa vraie date", () => {
    expect(chartSpecOf(traction, "chargeMax")).toMatchObject({ reversed: true, better: "Moins d'aide = mieux" });
    expect(chartSpecOf(byId("squat"), "chargeMax").reversed).toBe(false);
    const summary = buildExercisePerformanceSummary(history, "chargeMax", "assistance")!;
    expect(bestSeriesOf(summary)).toEqual({ text: "10 répétitions à 49 kg", date: "15 sept. 2026" });
  });
});

describe("cardio, comment faire, en-tête", () => {
  it("cardio : durée, vitesse, pente, FC par séance", () => {
    const tapis = byId("tapis");
    const session = {
      id: "c1", date: "2026-09-24", startedAt: "2026-09-24T08:00:00.000Z", status: "completed",
      blocks: [{ id: "b", kind: "exercise", exerciseId: "tapis", status: "performed", cardioSteps: [
        { id: "p1", position: 0, status: "completed", settings: { durationSec: 600, speedKmh: 4.5, inclinePercent: 0 }, bpm: 95 },
        { id: "p2", position: 1, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 8 }, bpm: 110 },
      ] }],
    } as unknown as WorkoutSession;
    expect(cardioRowsOf(tapis, [session])).toEqual([{ workoutId: "c1", date: "24 sept.", duration: "15 min", speed: "4,5–5 km/h", incline: "0–8 %", bpm: "110 bpm" }]);
  });

  it("une phrase par point de technique ; étiquettes sans doublon", () => {
    expect(sentencesOf("Place la corde. Tire vers le visage, puis reviens. Garde le dos droit.")).toEqual([
      "Place la corde.",
      "Tire vers le visage, puis reviens.",
      "Garde le dos droit.",
    ]);
    expect(headerTagsOf(byId("traction-assistee"))).toEqual(["Dos", "Tirage", "Machine"]);
  });
});
