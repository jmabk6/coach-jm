import { describe, expect, it } from "vitest";
import type { PerformedSeries, StrengthFrameVersion, WorkoutSession } from "../models";
import {
  formatFrameValidation,
  formatFrameVersionSummary,
  formatStrengthValue,
  frameParametersChanged,
  frameTypesFor,
  frameVersionIdsOf,
  isVersionFrozen,
  loadToWork,
  seriesByFrameVersion,
  targetDurationInForce,
  validateFrame,
} from "./strengthRules";

const T = "2026-09-22T10:00:00.000Z";

function version(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
    id: "v1",
    frameId: "f1",
    number: 1,
    status: "active",
    progressionType: "charge_croissante",
    workSets: 3,
    repRange: { min: 10, max: 12 },
    rpeTarget: 8,
    restSec: 90,
    increment: { unit: "kg", value: 2.5 },
    createdAt: T,
    updatedAt: T,
    ...overrides,
  };
}

let n = 0;
function series(overrides: Partial<PerformedSeries>): PerformedSeries {
  n += 1;
  return { id: `s${n}`, position: n, status: "completed", role: "travail", ...overrides };
}

const kg = (value: number) => ({ kind: "total" as const, kg: value });

describe("validateFrame — critères et motifs (spec § 4, conception § 4.4)", () => {
  const good = () => [
    series({ load: kg(100), reps: 12, rpe: 8 }),
    series({ load: kg(100), reps: 12, rpe: 7 }),
    series({ load: kg(100), reps: 12, rpe: 8 }),
  ];

  it("valide quand tout est rempli ; la valeur est la charge tenue sur toutes les séries", () => {
    expect(validateFrame(version(), good())).toEqual({ validated: true, value: 100, unit: "kg" });

    /* Une série plus légère : le palier validé est le plus bas. */
    const mixed = good();
    mixed[1] = series({ load: kg(95), reps: 12, rpe: 7 });
    expect(validateFrame(version(), mixed)).toEqual({ validated: true, value: 95, unit: "kg", pendingValue: 100 });
  });

  it("charges différentes (précision du 22/09/2026) : jalon = charge tenue sur toutes les séries, la plus haute reste à confirmer", () => {
    const climbing = [
      series({ load: kg(40), reps: 12, rpe: 7 }),
      series({ load: kg(45), reps: 12, rpe: 8 }),
      series({ load: kg(45), reps: 12, rpe: 8 }),
    ];
    const result = validateFrame(version(), climbing);
    expect(result).toEqual({ validated: true, value: 40, unit: "kg", pendingValue: 45 });
    expect(formatFrameValidation(result, 3)).toBe("Palier validé à 40 kg — 45 kg reste à confirmer sur 3 séries");

    /* Charges identiques : pas de mention. */
    expect(formatFrameValidation(validateFrame(version(), good()), 3)).toBe("Validé — 100 kg");
    expect(formatFrameValidation({ validated: false, reason: "cote_limite" }, 3)).toBe("Non validé — série limitée par un côté");

    /* Assistance : le jalon est l'assistance la plus haute, la plus basse reste à confirmer. */
    const pullups = version({ progressionType: "assistance_decroissante", repRange: { min: 6, max: 8 }, rpeTarget: 9 });
    const assisted = [
      series({ load: kg(25), reps: 8, rpe: 8 }),
      series({ load: kg(20), reps: 8, rpe: 9 }),
      series({ load: kg(20), reps: 8, rpe: 9 }),
    ];
    expect(validateFrame(pullups, assisted)).toEqual({ validated: true, value: 25, unit: "kg", pendingValue: 20 });
    expect(formatFrameValidation(validateFrame(pullups, assisted), 3)).toBe("Palier validé à 25 kg — 20 kg reste à confirmer sur 3 séries");
  });

  it("ignore les échauffements, les séries non validées, et exige au moins workSets séries de travail", () => {
    const withWarmups = [
      series({ load: kg(40), reps: 15, rpe: 3, role: "echauffement" }),
      series({ load: kg(60), reps: 12, rpe: 5, role: "echauffement" }),
      ...good(),
    ];
    expect(validateFrame(version(), withWarmups)).toMatchObject({ validated: true, value: 100 });

    const twoOnly = good().slice(0, 2);
    expect(validateFrame(version(), twoOnly)).toEqual({ validated: false, reason: "series_manquantes" });

    /* Trois séries dont une échauffement : il n'en reste que deux de travail. */
    const oneWarm = good();
    oneWarm[0] = series({ load: kg(100), reps: 12, rpe: 8, role: "echauffement" });
    expect(validateFrame(version(), oneWarm)).toEqual({ validated: false, reason: "series_manquantes" });

    const notDone = [...good(), series({ status: "not_performed" })];
    expect(validateFrame(version(), notDone)).toMatchObject({ validated: true });

    /* Une quatrième série de travail qui échoue bloque aussi : « chacune ». */
    const fourth = [...good(), series({ load: kg(100), reps: 9, rpe: 9 })];
    expect(validateFrame(version(), fourth)).toEqual({ validated: false, reason: "reps_insuffisantes" });
  });

  it("motifs dans l'ordre : séries manquantes → reps → RPE → côté limité", () => {
    /* Tout échoue à la fois, sauf le nombre : les reps priment. */
    const all = [
      series({ load: kg(100), reps: 9, rpe: 9, sideLimited: true }),
      series({ load: kg(100), reps: 12, rpe: 8 }),
      series({ load: kg(100), reps: 12, rpe: 8 }),
    ];
    expect(validateFrame(version(), all)).toEqual({ validated: false, reason: "reps_insuffisantes" });

    const rpeAndSide = good();
    rpeAndSide[2] = series({ load: kg(100), reps: 12, rpe: 9, sideLimited: true });
    expect(validateFrame(version(), rpeAndSide)).toEqual({ validated: false, reason: "rpe_trop_eleve" });

    const sideOnly = good();
    sideOnly[0] = series({ load: kg(100), reps: 12, rpe: 8, sideLimited: true });
    expect(validateFrame(version(), sideOnly)).toEqual({ validated: false, reason: "cote_limite" });

    /* Deux séries dont une sans reps : le nombre prime sur tout. */
    expect(validateFrame(version(), [series({ load: kg(100) }), series({ load: kg(100), reps: 12, rpe: 8 })])).toEqual({
      validated: false,
      reason: "series_manquantes",
    });
  });

  it("RPE absent avec une cible : non validé, motif dédié ; RPE égal à la cible : validé", () => {
    const missing = good();
    missing[1] = series({ load: kg(100), reps: 12 });
    expect(validateFrame(version(), missing)).toEqual({ validated: false, reason: "rpe_manquant" });

    const atTarget = good().map((item) => ({ ...item, rpe: 8 }));
    expect(validateFrame(version(), atTarget)).toMatchObject({ validated: true });
  });

  it("charge non renseignée sur une série de travail : non validé, motif technique", () => {
    const noLoad = good();
    noLoad[2] = series({ reps: 12, rpe: 8 });
    expect(validateFrame(version(), noLoad)).toEqual({ validated: false, reason: "charge_inconnue" });

    /* Par côté avec tare, à vide avec tare : résolues. */
    const perSide = [
      series({ load: { kind: "per_side", kgPerSide: 40, tareKg: 20 }, reps: 12, rpe: 8 }),
      series({ load: { kind: "per_side", kgPerSide: 40, tareKg: 20 }, reps: 12, rpe: 8 }),
      series({ load: { kind: "empty", tareKg: 100 }, reps: 12, rpe: 8 }),
    ];
    expect(validateFrame(version(), perSide)).toEqual({ validated: true, value: 100, unit: "kg" });
  });

  it("durée croissante : durée en vigueur tenue sur chaque série, RPE ignoré sans cible, valeur = durée en vigueur", () => {
    const plank = version({ progressionType: "duree_croissante", targetDurationSec: 45, workSets: 3 });
    delete plank.repRange;
    delete plank.rpeTarget;

    const held = [series({ durationSec: 45 }), series({ durationSec: 50 }), series({ durationSec: 45, rpe: 10 })];
    expect(validateFrame(plank, held)).toEqual({ validated: true, value: 45, unit: "sec" });

    const short = [series({ durationSec: 45 }), series({ durationSec: 40 }), series({ durationSec: 45 })];
    expect(validateFrame(plank, short)).toEqual({ validated: false, reason: "reps_insuffisantes" });

    /* Objectif accepté à 50 s : c'est lui la durée en vigueur (v1.6, § 4.4). */
    const withTarget: StrengthFrameVersion = {
      ...plank,
      currentTarget: { value: 50, unit: "sec", acceptedAt: T, fromMilestoneId: "m1" },
    };
    expect(targetDurationInForce(withTarget)).toBe(50);
    expect(validateFrame(withTarget, held)).toEqual({ validated: false, reason: "reps_insuffisantes" });
    expect(validateFrame(withTarget, held.map((item) => ({ ...item, durationSec: 50 })))).toEqual({
      validated: true,
      value: 50,
      unit: "sec",
    });

    /* Une cible de RPE posée sur la durée s'applique comme ailleurs. */
    const withRpe: StrengthFrameVersion = { ...plank, rpeTarget: 8 };
    expect(validateFrame(withRpe, held.map((item) => ({ ...item, rpe: 9 })))).toEqual({
      validated: false,
      reason: "rpe_trop_eleve",
    });
  });

  it("assistance décroissante : valeur = assistance la plus haute tenue, plafond à zéro", () => {
    const pullups = version({ progressionType: "assistance_decroissante", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 9 });
    const done = [
      series({ load: kg(20), reps: 8, rpe: 8 }),
      series({ load: kg(25), reps: 8, rpe: 9 }),
      series({ load: kg(20), reps: 8, rpe: 9 }),
    ];
    expect(validateFrame(pullups, done)).toEqual({ validated: true, value: 25, unit: "kg", pendingValue: 20 });

    const free = done.map((item) => ({ ...item, load: kg(0) }));
    expect(validateFrame(pullups, free)).toEqual({ validated: true, value: 0, unit: "kg", ceilingReached: true });
  });
});

describe("cadres — paramètres, figeage, lectures", () => {
  it("types possibles selon la mesure et la catégorie", () => {
    expect(frameTypesFor({ category: "Musculation", measurementType: "load_reps" })).toEqual([
      "charge_croissante",
      "assistance_decroissante",
    ]);
    expect(frameTypesFor({ category: "Musculation", measurementType: "duration" })).toEqual(["duree_croissante"]);
    expect(frameTypesFor({ category: "Musculation", measurementType: "reps" })).toEqual([]);
    expect(frameTypesFor({ category: "Musculation", measurementType: "reps_per_side" })).toEqual([]);
    expect(frameTypesFor({ category: "Mobilité", measurementType: "duration" })).toEqual([]);
  });

  it("un paramètre change la version ; barre, objectif et libellés non", () => {
    const base = version();
    expect(frameParametersChanged(base, base)).toBe(false);
    expect(frameParametersChanged(base, version({ barWeightKg: 20 }))).toBe(false);
    expect(frameParametersChanged(base, version({ currentTarget: { value: 100, unit: "kg", acceptedAt: T } }))).toBe(false);
    expect(frameParametersChanged(base, { ...base, workSets: 4 })).toBe(true);
    expect(frameParametersChanged(base, { ...base, repRange: { min: 8, max: 10 } })).toBe(true);
    expect(frameParametersChanged(base, { ...base, rpeTarget: 9 })).toBe(true);
    expect(frameParametersChanged(base, { ...base, restSec: 120 })).toBe(true);
    expect(frameParametersChanged(base, { ...base, increment: { unit: "kg", value: 5 } })).toBe(true);
    expect(isVersionFrozen(base)).toBe(false);
    expect(isVersionFrozen({ firstOfficialWorkoutId: "w1" })).toBe(true);
  });

  it("versions référencées et séries par version : briques réalisées et tours validés", () => {
    const workout: Pick<WorkoutSession, "blocks"> = {
      blocks: [
        {
          id: "b1",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "presse",
          frameVersionId: "v-presse",
          status: "performed",
          snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
          series: [
            series({ load: kg(100), reps: 12, rpe: 8 }),
            series({ status: "not_performed" }),
          ],
        },
        {
          id: "b2",
          kind: "exercise",
          position: 1,
          addedDuringWorkout: false,
          exerciseId: "curl",
          frameVersionId: "v-curl",
          status: "skipped",
          snapshotInstructions: { shape: "reps", sets: 1, reps: { min: 10, max: 12 }, restBetweenSetsSec: 60 },
          series: [series({ load: kg(10), reps: 12 })],
        },
        {
          id: "g",
          kind: "group",
          position: 2,
          addedDuringWorkout: false,
          status: "performed",
          plannedRounds: 2,
          plannedRestBetweenRoundsSec: 60,
          children: [
            {
              id: "c1",
              sourceChildId: "c1",
              position: 0,
              exerciseId: "tirage",
              snapshotInstructions: { shape: "reps", reps: { min: 10, max: 12 } },
            },
          ],
          rounds: [
            {
              id: "r1",
              roundNumber: 1,
              status: "completed",
              children: [{ id: "r1c1", groupChildId: "c1", exerciseId: "tirage", frameVersionId: "v-tirage", load: kg(50), reps: 12, rpe: 7, completedAt: T }],
            },
            {
              id: "r2",
              roundNumber: 2,
              status: "not_performed",
              children: [{ id: "r2c1", groupChildId: "c1", exerciseId: "tirage", frameVersionId: "v-tirage" }],
            },
          ],
        },
      ],
    };

    expect([...frameVersionIdsOf(workout)].sort()).toEqual(["v-curl", "v-presse", "v-tirage"]);

    const byVersion = seriesByFrameVersion(workout);
    expect([...byVersion.keys()].sort()).toEqual(["v-presse", "v-tirage"]);
    expect(byVersion.get("v-presse")).toHaveLength(1);
    expect(byVersion.get("v-tirage")).toEqual([
      expect.objectContaining({ id: "r1c1", status: "completed", load: kg(50), reps: 12, rpe: 7 }),
    ]);
  });

  it("résumé, valeurs et charge à travailler", () => {
    expect(formatFrameVersionSummary(version())).toBe("3 × 10–12 · RPE ≤ 8");
    const plank = version({ progressionType: "duree_croissante", targetDurationSec: 45 });
    delete plank.repRange;
    delete plank.rpeTarget;
    expect(formatFrameVersionSummary(plank)).toBe("3 × 45 s");
    expect(formatStrengthValue(37.5, "kg")).toBe("37,5 kg");
    expect(formatStrengthValue(60, "sec")).toBe("60 s");

    const last = [
      series({ load: kg(60), reps: 12, role: "echauffement" }),
      series({ load: kg(100), reps: 12, rpe: 8 }),
      series({ load: kg(100), reps: 11, rpe: 9 }),
    ];
    expect(loadToWork(version(), last)).toEqual({ value: 100, unit: "kg", source: "derniere_seance" });
    expect(loadToWork(version(), [last[0]!])).toBeUndefined();
    expect(loadToWork(version(), undefined)).toBeUndefined();
    expect(
      loadToWork(version({ currentTarget: { value: 102.5, unit: "kg", acceptedAt: T } }), last),
    ).toEqual({ value: 102.5, unit: "kg", source: "objectif" });
    expect(loadToWork(plank, [series({ durationSec: 50 })])).toEqual({ value: 50, unit: "sec", source: "derniere_seance" });
  });
});
