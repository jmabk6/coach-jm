import { describe, expect, it } from "vitest";
import type { PerformedSeries, WorkoutSession } from "../../domain";
import { buildEstablishedDataset, ESTABLISHED_WEEKS } from "./fixtures/establishedDataset";
import { buildOverview, isCountedWorkout } from "./overview";
import { resolvePeriod, type DateRange } from "./period";

/**
 * Le jeu « état établi » recompté à la main : chaque chiffre du moteur
 * doit se retrouver par des boucles simples sur les données brutes.
 */

const dataset = buildEstablishedDataset("2026-09-10");
const period = resolvePeriod("12w", dataset.today);
const overview = buildOverview(dataset, period, dataset.today, { coverageStart: dataset.coverageStart });

const inRange = (date: string, range: DateRange) => date >= range.start && date <= range.end;
const seriesKg = (series: PerformedSeries) =>
  series.load?.kind === "total" ? series.load.kg : series.load?.kind === "per_side" ? series.load.kgPerSide * 2 : 0;

function rawTotals(range: DateRange) {
  const exerciseById = new Map(dataset.exercises.map((exercise) => [exercise.id, exercise]));
  let sessions = 0;
  let strengthSessions = 0;
  let cardioSessions = 0;
  let seriesDone = 0;
  let volumeKg = 0;
  let cardioSec = 0;
  const byZone = new Map<string, number>();
  const byCategory = new Map<string, number>();

  for (const workout of dataset.workouts) {
    if (workout.status !== "completed" || !inRange(workout.date, range)) continue;
    if (!workout.blocks.some((block) => block.kind !== "note" && block.status === "performed")) continue;

    sessions += 1;
    let hasSeries = false;
    let hasCardio = false;

    for (const block of workout.blocks) {
      if (block.kind !== "exercise" || block.status !== "performed") continue;
      const exercise = exerciseById.get(block.exerciseId)!;

      if (exercise.mode === "series") {
        for (const series of block.series ?? []) {
          if (series.status !== "completed") continue;
          hasSeries = true;
          seriesDone += 1;
          byZone.set(exercise.zone!, (byZone.get(exercise.zone!) ?? 0) + 1);
          if (exercise.measurementType === "load_reps") volumeKg += seriesKg(series) * (series.reps ?? 0);
        }
      } else {
        hasCardio = true;
        for (const step of block.cardioSteps ?? []) if (step.status === "completed") cardioSec += step.settings.durationSec;
        cardioSec += block.simpleMeasurement?.durationSec ?? 0;
      }
    }

    if (hasSeries) strengthSessions += 1;
    if (hasCardio) cardioSessions += 1;

    const category = workout.sessionTemplateId
      ? dataset.templates.find((template) => template.id === workout.sessionTemplateId)!.category
      : "Sans catégorie";
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  return { sessions, strengthSessions, cardioSessions, seriesDone, volumeKg, cardioSec, byZone, byCategory };
}

describe("jeu de référence « état établi » — 12 semaines recomptées à la main", () => {
  const current = rawTotals(period);
  const previous = rawTotals(period.previous);

  it("est cohérent : 26 semaines fictives, identifiants fx-, aucune date après aujourd'hui, collecte couvrant la période précédente", () => {
    expect(dataset.coverageStart).toBe("2026-03-16");
    expect(dataset.workouts.every((workout) => workout.id.startsWith("fx-") && workout.date <= dataset.today)).toBe(true);
    expect(dataset.plannedSessions.every((planned) => planned.id.startsWith("fx-"))).toBe(true);
    expect(dataset.exercises.every((exercise) => exercise.id.startsWith("fx-"))).toBe(true);
    expect(ESTABLISHED_WEEKS).toBe(26);
    expect(overview.previousCovered).toBe(true);
    expect(overview.coverageStart).toBe("2026-03-16");
    /* Sans date de collecte explicite, le même jeu ne montre aucune variation. */
    expect(buildOverview(dataset, period, dataset.today).previousCovered).toBe(false);
  });

  it("taux de réalisation : instances échues faites, sautées et manquées, l'instance du jour exclue tant qu'elle n'est pas faite", () => {
    let expected = 0;
    let done = 0;
    for (const planned of dataset.plannedSessions) {
      if (!inRange(planned.date, period)) continue;
      const workout = dataset.workouts.find((item) => item.id === planned.workoutId);
      const realised = planned.status === "done" && workout !== undefined && isCountedWorkout(workout);
      if (planned.date < dataset.today) {
        expected += 1;
        if (realised) done += 1;
      } else if (planned.date === dataset.today && realised) {
        expected += 1;
        done += 1;
      }
    }

    expect(overview.completion).toEqual({ done, expected, percent: Math.round((done / expected) * 100) });
    /* Du vendredi 19 juin au jeudi 10 septembre : 12 lundis (2 manqués), 12 mercredis,
       12 vendredis (3 sautés) → 31 réalisées sur 36 attendues. */
    expect(overview.completion).toEqual({ done: 31, expected: 36, percent: 86 });
    expect(dataset.plannedSessions.filter((planned) => planned.status === "skipped" && inRange(planned.date, period))).toHaveLength(3);
    expect(dataset.plannedSessions.filter((planned) => planned.status === "upcoming" && planned.date < dataset.today && inRange(planned.date, period))).toHaveLength(2);
  });

  it("fréquence : toutes les séances comptées, libres comprises, sur 12 semaines", () => {
    expect(overview.frequency).toEqual({
      sessions: current.sessions,
      weeks: 12,
      perWeek: Math.round((current.sessions / 12) * 10) / 10,
    });
    /* 31 planifiées réalisées + 8 samedis libres (4 Mobilité, 4 sans modèle). */
    expect(current.sessions).toBe(39);
    expect(overview.frequency.perWeek).toBe(3.3);
  });

  it("carte Renforcement : volume sur charge + reps, séries de tous les exercices en séries, séances contenant, variations vs période précédente", () => {
    expect(overview.strength).toEqual({
      volumeKg: current.volumeKg,
      seriesDone: current.seriesDone,
      sessions: current.strengthSessions,
      previous: { volumeKg: previous.volumeKg, seriesDone: previous.seriesDone, sessions: previous.strengthSessions },
      variation: {
        volume: Math.round(((current.volumeKg - previous.volumeKg) / previous.volumeKg) * 100),
        series: Math.round(((current.seriesDone - previous.seriesDone) / previous.seriesDone) * 100),
        sessions: Math.round(((current.strengthSessions - previous.strengthSessions) / previous.strengthSessions) * 100),
      },
    });
    /* Les charges montent : le volume progresse alors que les séances restent stables. */
    expect(overview.strength.variation.volume).toBeGreaterThan(0);
    expect(overview.strength.volumeKg).toBeGreaterThan(previous.volumeKg);
  });

  it("carte Cardio : durée mesurée (tapis + vélo), séances contenant du cardio, variations", () => {
    expect(overview.cardio).toEqual({
      durationSec: current.cardioSec,
      sessions: current.cardioSessions,
      previous: { durationSec: previous.cardioSec, sessions: previous.cardioSessions },
      variation: {
        duration: Math.round(((current.cardioSec - previous.cardioSec) / previous.cardioSec) * 100),
        sessions: Math.round(((current.cardioSessions - previous.cardioSessions) / previous.cardioSessions) * 100),
      },
    });
    /* Même rythme cardio d'une période à l'autre : la variation existe et vaut 0 %, elle n'est pas masquée. */
    expect(overview.cardio.variation).toEqual({ duration: 0, sessions: 0 });
  });

  it("répartitions : catégories (somme = total = séances comptées) et zones (somme = séries réalisées)", () => {
    expect(overview.categories.total).toBe(current.sessions);
    expect(overview.categories.lines.reduce((sum, line) => sum + line.count, 0)).toBe(current.sessions);
    for (const line of overview.categories.lines) {
      expect(line.count).toBe(current.byCategory.get(line.key) ?? 0);
    }
    expect(overview.categories.lines.map((line) => line.key)).toEqual(["Musculation", "Cardio", "Mobilité", "Sans catégorie"]);

    expect(overview.zones.total).toBe(current.seriesDone);
    for (const line of overview.zones.lines) {
      expect(line.count).toBe(current.byZone.get(line.key) ?? 0);
    }
    expect(overview.zones.lines.map((line) => line.key)).toEqual(["Jambes", "Dos", "Pecs", "Épaules", "Bras", "Core"]);
    const percentSum = overview.zones.lines.reduce((sum, line) => sum + line.percent, 0);
    expect(Math.abs(percentSum - 100)).toBeLessThanOrEqual(2);
  });

  it("dernières séances : les six plus récentes, de la plus récente à la plus ancienne", () => {
    const expected = dataset.workouts
      .filter((workout: WorkoutSession) => isCountedWorkout(workout) && inRange(workout.date, period))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 6)
      .map((workout) => workout.id);

    expect(overview.recent.map((line) => line.workoutId)).toEqual(expected);
    expect(overview.recent[0]).toMatchObject({ date: "2026-09-09", name: "Cardio", summary: "25 min · 12,5 km" });
    expect(overview.recent[1]).toMatchObject({ date: "2026-09-07", name: "Muscu A", summary: "48 min · 2 paliers" });
  });

  it("sur 4 semaines la période précédente reste couverte ; sur 1 an elle ne l'est plus", () => {
    const four = buildOverview(dataset, resolvePeriod("4w", dataset.today), dataset.today, { coverageStart: dataset.coverageStart });
    const year = buildOverview(dataset, resolvePeriod("1y", dataset.today), dataset.today, { coverageStart: dataset.coverageStart });

    expect(four.previousCovered).toBe(true);
    expect(four.strength.previous).toBeDefined();
    expect(year.previousCovered).toBe(false);
    expect(year.strength.variation).toEqual({});
    expect(year.cardio.variation).toEqual({});
  });
});
