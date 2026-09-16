import { describe, expect, it } from "vitest";

import type { Exercise, GroupBlock } from "../models";
import {
  canJoinGroup,
  defaultInstructionsFor,
  formatDurationShort,
  formatExerciseIdentity,
  formatExerciseInstructionsRow,
  formatGroupChildInstructionsRow,
  formatGroupName,
  formatGroupRow,
  formatRange,
} from "./blockInstructionRules";

const now = "2026-09-16T08:00:00.000Z";

const squat: Exercise = {
  id: "squat",
  name: "Squat barre",
  category: "Musculation",
  zone: "Jambes",
  movement: "Squat",
  equipment: "Barre",
  location: "Salle",
  mode: "series",
  measurementType: "load_reps",
  status: "active",
  createdAt: now,
  updatedAt: now,
};

const tapis: Exercise = {
  id: "tapis",
  name: "Tapis",
  category: "Cardio",
  equipment: "Tapis",
  location: "Salle",
  mode: "steps",
  measurementType: "duration_speed_incline",
  status: "active",
  createdAt: now,
  updatedAt: now,
};

const marche: Exercise = {
  id: "marche",
  name: "Marche",
  category: "Cardio",
  equipment: "Tapis",
  location: "Maison",
  mode: "simple",
  measurementType: "distance",
  status: "active",
  createdAt: now,
  updatedAt: now,
};

describe("formats élémentaires", () => {
  it("écrit les durées en secondes puis en minutes", () => {
    expect(formatDurationShort(45)).toBe("45 s");
    expect(formatDurationShort(120)).toBe("2 min");
    expect(formatDurationShort(90)).toBe("1 min 30");
    expect(formatDurationShort(2220)).toBe("37 min");
  });

  it("écrit une fourchette avec un demi-cadratin, ou une valeur seule", () => {
    expect(formatRange({ min: 8, max: 10 })).toBe("8–10");
    expect(formatRange({ min: 7, max: 7 })).toBe("7");
  });

  it("construit la ligne d'identité selon la famille", () => {
    expect(formatExerciseIdentity(squat)).toBe("Jambes · Squat · Barre");
    expect(formatExerciseIdentity(tapis)).toBe("Cardio · Tapis · Salle");
  });
});

describe("formatExerciseInstructionsRow", () => {
  it("reproduit les rangées du tableau de la spec (§6)", () => {
    expect(
      formatExerciseInstructionsRow({
        shape: "reps",
        sets: 3,
        reps: { min: 8, max: 10 },
        targetRpe: { min: 7, max: 7 },
        restBetweenSetsSec: 120,
      }),
    ).toBe("3 séries · 8–10 reps · RPE 7 · repos 2 min");

    expect(
      formatExerciseInstructionsRow({
        shape: "duration",
        sets: 3,
        durationSec: 45,
        restBetweenSetsSec: 45,
      }),
    ).toBe("3 séries · 45 s · repos 45 s");

    expect(
      formatExerciseInstructionsRow({
        shape: "steps",
        steps: [
          { id: "1", position: 0, durationSec: 300, speedKmh: 4.5, inclinePercent: 0 },
          { id: "2", position: 1, durationSec: 300, speedKmh: 5, inclinePercent: 5 },
          { id: "3", position: 2, durationSec: 300, speedKmh: 5, inclinePercent: 8 },
          { id: "4", position: 3, durationSec: 300, speedKmh: 5, inclinePercent: 10 },
          { id: "5", position: 4, durationSec: 300, speedKmh: 5, inclinePercent: 12 },
          { id: "6", position: 5, durationSec: 300, speedKmh: 5, inclinePercent: 5 },
        ],
      }),
    ).toBe("6 paliers · 30 min · 4,5 à 5 km/h · 0 à 12 %");

    expect(formatExerciseInstructionsRow({ shape: "distance" })).toBe(
      "distance libre",
    );
  });

  it("omet le RPE absent et signale des paliers vides", () => {
    expect(
      formatExerciseInstructionsRow({
        shape: "reps",
        sets: 1,
        reps: { min: 12, max: 12 },
        restBetweenSetsSec: 60,
      }),
    ).toBe("1 série · 12 reps · repos 1 min");

    expect(formatExerciseInstructionsRow({ shape: "steps", steps: [] })).toBe(
      "Paliers à définir",
    );
  });

  it("gère les mesures simples renseignées ou libres", () => {
    expect(
      formatExerciseInstructionsRow({
        shape: "duration_distance",
        durationSec: 1800,
        distanceKm: 2.5,
      }),
    ).toBe("30 min · 2,5 km");
    expect(
      formatExerciseInstructionsRow({ shape: "duration_distance" }),
    ).toBe("durée et distance libres");
    expect(
      formatExerciseInstructionsRow({
        shape: "distance_cm_per_side",
        leftCm: 12,
        rightCm: 10,
      }),
    ).toBe("G 12 cm · D 10 cm");
  });
});

describe("groupes", () => {
  const group: GroupBlock = {
    id: "g",
    kind: "group",
    position: 3,
    rounds: 3,
    restBetweenRoundsSec: 60,
    children: [],
  };

  it("formate la rangée du groupe et de ses enfants", () => {
    expect(formatGroupRow(group)).toBe("3 tours · repos 1 min entre les tours");
    expect(
      formatGroupChildInstructionsRow({
        shape: "reps",
        reps: { min: 8, max: 12 },
        targetRpe: { min: 7, max: 7 },
      }),
    ).toBe("8–12 reps · RPE 7");
    expect(
      formatGroupChildInstructionsRow({ shape: "duration", durationSec: 45 }),
    ).toBe("45 s");
  });

  it("replie sur Groupe N quand le nom est vide", () => {
    expect(formatGroupName(group, "3")).toBe("Groupe 3");
    expect(formatGroupName({ ...group, name: "  " }, "3")).toBe("Groupe 3");
    expect(formatGroupName({ ...group, name: "Superset dos" }, "3")).toBe(
      "Superset dos",
    );
  });

  it("n'accepte dans un groupe que les exercices en séries", () => {
    expect(canJoinGroup(squat)).toBe(true);
    expect(canJoinGroup(tapis)).toBe(false);
    expect(canJoinGroup(marche)).toBe(false);
  });
});

describe("defaultInstructionsFor", () => {
  it("dérive la forme des consignes du type de mesure", () => {
    let counter = 0;
    const newId = () => `id-${++counter}`;

    expect(defaultInstructionsFor(squat, newId).shape).toBe("reps");
    expect(defaultInstructionsFor(tapis, newId)).toEqual({
      shape: "steps",
      steps: [
        { id: "id-1", position: 0, durationSec: 600, speedKmh: 5, inclinePercent: 0 },
      ],
    });
    expect(defaultInstructionsFor(marche, newId)).toEqual({ shape: "distance" });
  });
});
