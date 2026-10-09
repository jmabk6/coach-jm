import "fake-indexeddb/auto";

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type {
  ExerciseBlock,
  SessionBlock,
  Goal,
  InstallMarkers,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedSeries,
  SessionTemplate,
  StrengthFrameVersion,
  WorkoutSession,
} from "../../domain";
import { seriesByFrameVersion } from "../../domain/rules/strengthRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { readBackup, serializeBackup } from "../backup/exportBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import {
  V6_FORCE_BLOCK_ID,
  V6_LIGHT_BLOCK_ID,
  V6_NEGATIVES_BLOCK_ID,
  V6_NEGATIVES_START,
  V6_START_B_KG,
  V6_START_KG,
  V6_STEP_KG,
  V6_VALIDATION_REPS,
  v6LightSession,
  v6SnapshotAdjustments,
  v6State,
  v6VolumeKgAfter,
} from "../goals/tractionV6";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { advisedLoadOf } from "../workout/advisedLoad";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { proposeSeriesValues } from "../workout/engine/workoutBlocks";
import { findLastOwnBlockPerformances, findLastPerformances, lastTimeOf, listSeriesByExercise } from "../workout/lastPerformance";
import { GOAL_LINKS_V2, MUSCU_C_BLOCKS_BEFORE_20261009, NEGATIVES_NOTE, NEGATIVES_NOTE_AFTER_SUSPENSION, PROGRAM_V2_TEMPLATES, SPRINTS_NOTE, TRACTION_LIGHT_NOTE } from "./programV2";
import { BLOCKS_BEFORE_20261005, seedProgramMuscu20261005, toProgramMuscu20261005, tractionGoalWithoutPullover } from "./seedProgramMuscu20261005";

/**
 * Programme muscu du 05/10/2026 (seed 38) : A force, B volume, C sans
 * pullover ; négatives après l'échauffement dès le 01/11 ; option B —
 * rowing et chest press gardent un seul exercice et un historique commun,
 * la brique lourde seule pilote le cadre, la brique de volume ou de rappel
 * a sa propre « Dernière fois ». Le pari V6, les cardios, les routines et
 * l'historique ne bougent pas.
 */

const NOW = "2026-10-05T20:00:00.000Z";
const template = (id: string) => PROGRAM_V2_TEMPLATES.find((item) => item.id === id) as SessionTemplate;
const block = (templateId: string, id: string) => template(templateId).blocks.find((item) => item.id === id) as ExerciseBlock;
const withoutPosition = (entry: object) => {
  const copy = { ...entry } as Record<string, unknown>;
  delete copy.position;
  return copy;
};
const order = (item: Pick<SessionTemplate, "blocks">) => [...item.blocks].sort((a, b) => a.position - b.position).map((entry) => entry.id);
const exercises = (item: Pick<SessionTemplate, "blocks">) =>
  [...item.blocks].sort((a, b) => a.position - b.position).map((entry) => (entry.kind === "exercise" ? entry.exerciseId : entry.kind === "group" ? `groupe ${entry.name}` : "note"));
const ids = (blocks: PerformedBlock[]) => blocks.map((entry) => (entry.kind === "test" ? "test" : entry.sourceBlockId));
const snapshotOn = (id: string, date: string) => createWorkoutSnapshot(template(id), undefined, undefined, [], v6SnapshotAdjustments(template(id), date));

/* -------------------------------------------------------------------------- */
/* Séances réalisées de test                                                  */
/* -------------------------------------------------------------------------- */

const serie = (kg: number, reps: number, rpe = 8, index = 0): PerformedSeries => ({
  id: `s${index}-${kg}-${reps}`, position: index, status: "completed", role: "travail", load: { kind: "total", kg }, reps, rpe, completedAt: "2026-10-04T09:30:00.000Z",
});

function performed(sourceBlockId: string, exerciseId: string, series: PerformedSeries[], extra: Partial<PerformedExerciseBlock> = {}): PerformedExerciseBlock {
  return {
    id: `workout-block-${sourceBlockId}`, sourceBlockId, kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId, status: "performed",
    snapshotInstructions: { shape: "reps", sets: series.length, reps: { min: 6, max: 15 }, restBetweenSetsSec: 120 },
    series, ...extra,
  };
}

function workout(id: string, date: string, sessionTemplateId: string, blocks: PerformedExerciseBlock[]): WorkoutSession {
  return {
    id, source: "planned", kind: "training", status: "completed", date, sessionTemplateId, blocks,
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: `${date}T10:00:00.000Z`, activeDurationSec: 3600, createdAt: "x", updatedAt: "x",
  } as WorkoutSession;
}

/** Dimanche : rowing lourd 60 kg (Muscu A) ; mardi : rowing de volume 45 kg, chest press lourd 70 kg (Muscu B) ; dimanche suivant : chest press de rappel 55 kg. */
const sundayA = workout("w-a-1011", "2026-10-11", "v2-muscu-a", [
  performed("v2-muscu-a-rowing", "rowing-poulie-basse", [serie(60, 8, 9, 0), serie(60, 7, 9, 1), serie(60, 6, 9, 2)], { frameVersionId: "rowing-v3" }),
  performed("v2-muscu-a-chest-press", "chest-press", [serie(55, 12, 8, 0), serie(55, 11, 8, 1)], { frameVersionId: "chest-v3", outsideFrame: true, ownReference: true, reducedPrescription: true }),
]);
const tuesdayB = workout("w-b-1013", "2026-10-13", "v2-muscu-b", [
  performed("v2-muscu-b-chest-press", "chest-press", [serie(70, 8, 9, 0), serie(70, 7, 9, 1), serie(70, 6, 9, 2)], { frameVersionId: "chest-v3" }),
  performed("v2-muscu-b-rowing", "rowing-poulie-basse", [serie(45, 15, 8, 0), serie(45, 13, 8, 1)], { frameVersionId: "rowing-v3", outsideFrame: true, ownReference: true, reducedPrescription: true }),
]);
const history = [sundayA, tuesdayB];

/* -------------------------------------------------------------------------- */
/* 1-5. Pari V6 strictement inchangé                                          */
/* -------------------------------------------------------------------------- */

describe("pari V6 : inchangé", () => {
  it("1. décision Q1 : 35 validé (5/5/5) → A = 28, B reste 42 (dernier palier A validé + 7), jamais une valeur codée en dur", () => {
    const validated: WorkoutSession = {
      ...workout("w-v6", "2026-10-04", "v2-muscu-a", [performed(V6_FORCE_BLOCK_ID, "traction-assistee", [serie(35, 5, 8, 0), serie(35, 5, 8, 1), serie(35, 5, 8, 2)])]),
    };
    const state = v6State([validated], "2026-10-05");
    expect(state).toMatchObject({ aKg: 28, bKg: v6VolumeKgAfter(35) });
    expect(state.bKg).toBe(42);
    expect(v6LightSession(state, "2026-10-06").assistKg).toBe(42);
  });

  it("2-5. constantes, identifiants et briques du pari : mêmes valeurs qu'avant le programme du 05/10", () => {
    expect([V6_START_KG, V6_START_B_KG, V6_STEP_KG, V6_VALIDATION_REPS, V6_NEGATIVES_START]).toEqual([35, 42, 7, 5, "2026-11-01"]);
    expect([V6_FORCE_BLOCK_ID, V6_LIGHT_BLOCK_ID, V6_NEGATIVES_BLOCK_ID]).toEqual(["v2-muscu-a-traction", "v2-muscu-b-traction", "v2-muscu-c-negatives"]);
    expect(block("v2-muscu-a", V6_FORCE_BLOCK_ID)).toMatchObject({ position: 1, exerciseId: "traction-assistee", instructions: { shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 } });
    expect(block("v2-muscu-a", V6_FORCE_BLOCK_ID).outsideFrame).toBeUndefined();
    /* Traction légère : toujours en premier en Muscu B (décision du 03/10, réponse du 05/10), même consigne, hors palier. */
    expect(block("v2-muscu-b", V6_LIGHT_BLOCK_ID)).toMatchObject({ position: 1, exerciseId: "traction-assistee", notes: TRACTION_LIGHT_NOTE, outsideFrame: true, instructions: { sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 120 } });
    expect(block("v2-muscu-b", V6_LIGHT_BLOCK_ID).ownReference).toBeUndefined();
    expect(block("v2-muscu-c", V6_NEGATIVES_BLOCK_ID)).toMatchObject({ exerciseId: "traction-negative", instructions: { shape: "reps", sets: 2, reps: { min: 2, max: 2 }, restBetweenSetsSec: 150 } });
    /* Semaines test : mêmes allègements (B 2 séries, A aucun). */
    expect(v6SnapshotAdjustments(template("v2-muscu-b"), "2026-10-27")).toEqual([{ blockId: V6_LIGHT_BLOCK_ID, sets: 2 }]);
    expect(v6SnapshotAdjustments(template("v2-muscu-a"), "2026-10-25")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 6-14. Les modèles                                                          */
/* -------------------------------------------------------------------------- */

describe("Muscu C : négatives", () => {
  it("6. jamais avant le 01/11 (jeudis 08/10, 22/10, 29/10) ; 7. dès le 05/11 : échauffement → négatives → suspension → la suite (Muscu C du 09/10, seed 39)", () => {
    for (const date of ["2026-10-08", "2026-10-22", "2026-10-29"]) expect(ids(snapshotOn("v2-muscu-c", date)), date).not.toContain(V6_NEGATIVES_BLOCK_ID);
    const rest = [
      "v2-muscu-c-tirage-vertical", "v2-muscu-c-ecarte", "v2-muscu-c-elevations", "v2-muscu-c-face-pull", "v2-muscu-c-curl-marteau", "v2-muscu-c-triceps-tete", "v2-muscu-c-tapis-incline",
    ];
    expect(ids(snapshotOn("v2-muscu-c", "2026-10-08"))).toEqual(["v2-muscu-c-echauffement", "v2-muscu-c-suspension", ...rest]);
    expect(ids(snapshotOn("v2-muscu-c", "2026-11-05"))).toEqual(["v2-muscu-c-echauffement", "v2-muscu-c-negatives", "v2-muscu-c-suspension", ...rest]);
    expect(block("v2-muscu-c", V6_NEGATIVES_BLOCK_ID).notes).toBe(NEGATIVES_NOTE);
    expect(NEGATIVES_NOTE).toContain("Juste après l'échauffement");
    expect(NEGATIVES_NOTE).toContain("2 min 30 de repos");
    expect(NEGATIVES_NOTE).toContain("jamais à l'échec");
    /* Les sprints vélo ont quitté Muscu C le 09/10 (seed 39) ; leur consigne, durable et sans date, reste celle du 05/10. */
    expect(SPRINTS_NOTE).toBe("Première séance : étalonne la résistance pour pouvoir sprinter rapidement pendant 12 s. Ensuite, conserve le même vélo si possible et la même résistance à chaque séance.");
    expect(SPRINTS_NOTE).not.toMatch(/\d{1,2}\/\d{1,2}|20\d\d|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i);
  });
});

describe("Muscu A, B, C", () => {
  it("8. Muscu A sans tirage vertical ; 9. rowing lourd 3 × 6-8, RPE 8-9, 2 min 30, brique du cadre ; chest press de rappel 2 × 8-12, hors palier, référence propre", () => {
    expect(exercises(template("v2-muscu-a"))).toEqual([
      "tapis", "traction-assistee", "rowing-poulie-basse", "chest-press", "elevations-laterales-halteres", "curl-halteres", "leg-curl-couche", "presse-cuisses",
    ]);
    expect(template("v2-muscu-a").blocks.some((item) => item.kind === "exercise" && item.exerciseId === "tirage-vertical")).toBe(false);
    const rowing = block("v2-muscu-a", "v2-muscu-a-rowing");
    expect(rowing.instructions).toEqual({ shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150, targetRpe: { min: 8, max: 9 } });
    expect([rowing.outsideFrame, rowing.ownReference]).toEqual([undefined, undefined]);
    const chest = block("v2-muscu-a", "v2-muscu-a-chest-press");
    expect(chest.instructions).toEqual({ shape: "reps", sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 120, targetRpe: { min: 8, max: 9 } });
    expect([chest.outsideFrame, chest.ownReference]).toEqual([true, true]);
    expect(block("v2-muscu-a", "v2-muscu-a-presse")).toMatchObject({ outsideFrame: true, instructions: { sets: 2, reps: { min: 10, max: 12 }, restBetweenSetsSec: 120 } });
  });

  it("10. Muscu B : traction légère en premier, chest press lourd 3 × 6-8, incliné, rowing de volume 2 × 10-15 (hors palier, référence propre), épaules, élévations, triceps, presse", () => {
    expect(exercises(template("v2-muscu-b"))).toEqual([
      "tapis", "traction-assistee", "chest-press", "developpe-incline-halteres", "rowing-poulie-basse", "developpe-epaules-machine",
      "elevations-laterales-halteres", "extension-triceps-poulie", "presse-cuisses",
    ]);
    const chest = block("v2-muscu-b", "v2-muscu-b-chest-press");
    expect(chest.instructions).toEqual({ shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150, targetRpe: { min: 8, max: 9 } });
    expect([chest.outsideFrame, chest.ownReference]).toEqual([undefined, undefined]);
    const rowing = block("v2-muscu-b", "v2-muscu-b-rowing");
    expect(rowing.instructions).toEqual({ shape: "reps", sets: 2, reps: { min: 10, max: 15 }, restBetweenSetsSec: 120 });
    expect([rowing.outsideFrame, rowing.ownReference]).toEqual([true, true]);
    expect(rowing.notes).toContain("plus légère que le rowing lourd du dimanche");
  });

  it("13. Muscu C sans pullover ; 14. tirage vertical 2 × 10-15 à sa place, brique du cadre", () => {
    expect(template("v2-muscu-c").blocks.some((item) => item.kind === "exercise" && item.exerciseId === "pullover-poulie")).toBe(false);
    const tirage = block("v2-muscu-c", "v2-muscu-c-tirage-vertical");
    /* Position 3 depuis la Muscu C du 09/10 (seed 39 : sprints, montée et « Rester bas » sortis). */
    expect(tirage).toMatchObject({ position: 3, exerciseId: "tirage-vertical", instructions: { shape: "reps", sets: 2, reps: { min: 10, max: 15 }, restBetweenSetsSec: 120 } });
    expect([tirage.outsideFrame, tirage.ownReference]).toEqual([undefined, undefined]);
  });

  it("15. Cardio A, B, C : définitions identiques à celles d'avant le programme du 05/10 (empreinte)", () => {
    const cardio = PROGRAM_V2_TEMPLATES.filter((item) => item.id.startsWith("v2-cardio-"));
    expect(cardio.map((item) => item.id)).toEqual(["v2-cardio-a", "v2-cardio-b", "v2-cardio-c"]);
    expect(createHash("sha256").update(canonicalStringify(cardio)).digest("hex").slice(0, 32)).toBe("91f1902b9c7b46c0381305caf79b9330");
  });
});

/* -------------------------------------------------------------------------- */
/* 11-12. Option B : deux contextes, aucune pollution                         */
/* -------------------------------------------------------------------------- */

describe("option B : rowing et chest press, lourd et volume sans pollution", () => {
  const frame = (id: string, min: number, max: number): StrengthFrameVersion =>
    ({ id, frameId: id, number: 3, status: "active", progressionType: "charge_croissante", workSets: 3, repRange: { min, max }, rpeTarget: 9, restSec: 150, createdAt: "x", updatedAt: "x" }) as StrengthFrameVersion;
  const snapshotBlock = (templateId: string, blockId: string, frameId: string) => {
    const exerciseId = block(templateId, blockId).exerciseId;
    const version = frame(frameId, 6, 8);
    return createWorkoutSnapshot(template(templateId), new Map([[exerciseId, version.id]]), new Map([[version.id, version]])).find(
      (item) => item.kind === "exercise" && item.sourceBlockId === blockId,
    ) as PerformedExerciseBlock;
  };

  it("11. rowing : la brique lourde de A ne voit jamais le volume de B (même plus récent), la brique de volume de B ne voit jamais la charge lourde de A", () => {
    const byExercise = findLastPerformances(history);
    const ownA = findLastOwnBlockPerformances(history, "v2-muscu-a");
    const ownB = findLastOwnBlockPerformances(history, "v2-muscu-b");
    const heavy = snapshotBlock("v2-muscu-a", "v2-muscu-a-rowing", "rowing-v3");
    const volume = snapshotBlock("v2-muscu-b", "v2-muscu-b-rowing", "rowing-v3");

    expect(lastTimeOf(heavy, byExercise, ownA)?.series.load).toEqual({ kind: "total", kg: 60 });
    expect(lastTimeOf(volume, byExercise, ownB)?.series.load).toEqual({ kind: "total", kg: 45 });
    /* Charge conseillée et valeurs proposées : jamais celles de l'autre contexte. */
    expect(advisedLoadOf(undefined, frame("rowing-v3", 6, 8), lastTimeOf(heavy, byExercise, ownA)?.allSeries)).toMatchObject({ value: 60 });
    expect(advisedLoadOf(undefined, undefined, lastTimeOf(volume, byExercise, ownB)?.allSeries)).toMatchObject({ value: 45 });
    expect(proposeSeriesValues(volume, lastTimeOf(volume, byExercise, ownB)?.series).load).toEqual({ kind: "total", kg: 45 });
    expect(proposeSeriesValues(heavy, lastTimeOf(heavy, byExercise, ownA)?.series).load).toEqual({ kind: "total", kg: 60 });
    /* Premier mardi : sans rowing de B, rien — pas la charge lourde du dimanche. */
    expect(lastTimeOf(volume, findLastPerformances([sundayA]), findLastOwnBlockPerformances([sundayA], "v2-muscu-b"))).toBeUndefined();
    expect(advisedLoadOf(undefined, undefined, undefined)).toBeUndefined();
  });

  it("12. chest press : la brique lourde de B ne voit jamais le rappel de A, le rappel de A ne voit jamais la charge lourde de B", () => {
    const later = workout("w-a-1018", "2026-10-18", "v2-muscu-a", []);
    const all = [...history, later];
    const byExercise = findLastPerformances(all);
    const heavy = snapshotBlock("v2-muscu-b", "v2-muscu-b-chest-press", "chest-v3");
    const reminder = snapshotBlock("v2-muscu-a", "v2-muscu-a-chest-press", "chest-v3");
    expect(lastTimeOf(heavy, byExercise, findLastOwnBlockPerformances(all, "v2-muscu-b"))?.series.load).toEqual({ kind: "total", kg: 70 });
    expect(lastTimeOf(reminder, byExercise, findLastOwnBlockPerformances(all, "v2-muscu-a"))?.series.load).toEqual({ kind: "total", kg: 55 });
    /* Premier dimanche après le changement : sans chest press de A à référence propre, rien — pas les 70 kg du mardi. */
    expect(lastTimeOf(reminder, findLastPerformances([tuesdayB]), findLastOwnBlockPerformances([tuesdayB], "v2-muscu-a"))).toBeUndefined();
  });

  it("11-12. le cadre lourd n'est piloté que par les briques lourdes : volume et rappel réduits, hors palier, sans jalon ni stagnation", () => {
    const heavyRowing = snapshotBlock("v2-muscu-a", "v2-muscu-a-rowing", "rowing-v3");
    const volumeRowing = snapshotBlock("v2-muscu-b", "v2-muscu-b-rowing", "rowing-v3");
    const heavyChest = snapshotBlock("v2-muscu-b", "v2-muscu-b-chest-press", "chest-v3");
    const reminderChest = snapshotBlock("v2-muscu-a", "v2-muscu-a-chest-press", "chest-v3");
    for (const item of [heavyRowing, heavyChest]) expect([item.reducedPrescription, item.outsideFrame, item.ownReference], item.sourceBlockId).toEqual([undefined, undefined, undefined]);
    for (const item of [volumeRowing, reminderChest]) expect([item.reducedPrescription, item.outsideFrame, item.ownReference], item.sourceBlockId).toEqual([true, true, true]);
    /* Les séries de volume et de rappel n'entrent jamais dans la validation du cadre. */
    expect(seriesByFrameVersion(tuesdayB).get("rowing-v3")).toBeUndefined();
    expect(seriesByFrameVersion(sundayA).get("chest-v3")).toBeUndefined();
    expect(seriesByFrameVersion(sundayA).get("rowing-v3")).toHaveLength(3);
    expect(seriesByFrameVersion(tuesdayB).get("chest-v3")).toHaveLength(3);
  });

  it("historique et records communs : les séries de volume restent des séries ordinaires de l'exercice", () => {
    expect(listSeriesByExercise(tuesdayB).get("rowing-poulie-basse")).toHaveLength(2);
    expect(listSeriesByExercise(sundayA).get("chest-press")).toHaveLength(2);
  });

  it("autres briques hors palier (leg press de A, traction légère de B) : « Dernière fois » inchangée, par exercice", () => {
    const press = performed("v2-muscu-a-presse", "presse-cuisses", [], { outsideFrame: true });
    const lastB = workout("w-b", "2026-10-06", "v2-muscu-b", [performed("v2-muscu-b-presse", "presse-cuisses", [serie(130, 10)])]);
    expect(lastTimeOf(press, findLastPerformances([lastB]), findLastOwnBlockPerformances([lastB], "v2-muscu-a"))?.series.load).toEqual({ kind: "total", kg: 130 });
  });
});

/* -------------------------------------------------------------------------- */
/* Seed 38                                                                    */
/* -------------------------------------------------------------------------- */

describe("seed 38", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  /** Les modèles A, B, C tels qu'avant le seed 38 (sauvegarde du 05/10 à 08:19). */
  function before(item: SessionTemplate): SessionTemplate {
    const legacy: Record<string, Partial<ExerciseBlock> & { position: number }> = {
      "v2-muscu-a-echauffement": { position: 0 }, "v2-muscu-a-traction": { position: 1 },
      "v2-muscu-a-rowing": { position: 2, instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 120 } },
      "v2-muscu-a-chest-press": { position: 4, instructions: { shape: "reps", sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 120 } },
      "v2-muscu-a-elevations": { position: 5 }, "v2-muscu-a-curl": { position: 6 }, "v2-muscu-a-presse": { position: 7 }, "v2-muscu-a-leg-curl": { position: 8 },
      "v2-muscu-b-echauffement": { position: 0 }, "v2-muscu-b-traction": { position: 1 },
      "v2-muscu-b-chest-press": { position: 2, instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 120 } },
      "v2-muscu-b-developpe-incline": { position: 3 }, "v2-muscu-b-developpe-epaules": { position: 4 }, "v2-muscu-b-elevations": { position: 5 },
      "v2-muscu-b-extension-triceps": { position: 6 }, "v2-muscu-b-presse": { position: 7 },
      "v2-muscu-c-echauffement": { position: 0 }, "v2-muscu-c-suspension": { position: 1 },
      "v2-muscu-c-negatives": { position: 2, notes: NEGATIVES_NOTE_AFTER_SUSPENSION },
      "v2-muscu-c-sprints": { position: 3, notes: "Même vélo, même résistance à chaque séance." }, "v2-muscu-c-montee-banc": { position: 4, notes: "8 par jambe." },
      "v2-muscu-c-rester-bas": { position: 5 }, "v2-muscu-c-face-pull": { position: 7 }, "v2-muscu-c-curl-marteau": { position: 8 }, "v2-muscu-c-triceps-tete": { position: 9 },
    };
    const kept = item.blocks
      .filter((entry) => legacy[entry.id])
      .map((entry) => {
        const next = { ...entry, ...legacy[entry.id] } as ExerciseBlock;
        if (entry.id === "v2-muscu-a-rowing" || entry.id.endsWith("chest-press")) {
          delete next.notes;
          delete next.outsideFrame;
          delete next.ownReference;
        }
        return next;
      });
    /* Muscu C d'avant le 05/10 : avec sprints, montée et « Rester bas » (sortis le 09/10 par le seed 39). */
    const legacyC: SessionBlock[] = [
      { id: "v2-muscu-c-sprints", kind: "exercise", position: 3, exerciseId: "sprint-velo", instructions: { shape: "duration", sets: 6, durationSec: 12, restBetweenSetsSec: 48 }, notes: "Même vélo, même résistance à chaque séance." },
      { id: "v2-muscu-c-montee-banc", kind: "exercise", position: 4, exerciseId: "montee-banc", instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 8 }, restBetweenSetsSec: 60 }, notes: "8 par jambe." },
      {
        id: "v2-muscu-c-rester-bas", kind: "group", position: 5, name: "Rester bas", rounds: 3, restBetweenRoundsSec: 90,
        children: [{ id: "v2-muscu-c-chaise", position: 0, exerciseId: "chaise-60", instructions: { shape: "duration", durationSec: { min: 30, max: 45 } } }],
      },
    ];
    const added: SessionBlock[] =
      item.id === "v2-muscu-a"
        ? [{ id: "v2-muscu-a-tirage-vertical", kind: "exercise", position: 3, exerciseId: "tirage-vertical", instructions: { shape: "reps", sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 120 } }]
        : item.id === "v2-muscu-c"
          ? [
              { id: "v2-muscu-c-pullover", kind: "exercise", position: 6, exerciseId: "pullover-poulie", instructions: { shape: "reps", sets: 3, reps: { min: 10, max: 15 }, restBetweenSetsSec: 90 } },
              ...legacyC.filter((entry) => !item.blocks.some((other) => other.id === entry.id)),
            ]
          : [];
    return { ...item, blocks: [...kept, ...added] };
  }

  async function installBefore() {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "programmeMuscu20261005" && seed.name !== "programmeMuscuC20261009"));
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]) await db.sessionTemplates.put(before((await db.sessionTemplates.get(id))!));
  }

  it("base d'avant : A, B, C exactement selon le programme ; autres briques intactes ; second passage et seed rejoué : rien", async () => {
    await installBefore();
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]) expect(order((await db.sessionTemplates.get(id))!).sort(), id).toEqual([...BLOCKS_BEFORE_20261005[id]!].sort());
    const untouched = (await db.sessionTemplates.get("v2-muscu-a"))!.blocks.find((entry) => entry.id === "v2-muscu-a-elevations");

    await seedProgramMuscu20261005(NOW);

    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]) {
      const after = (await db.sessionTemplates.get(id))!;
      expect(order(after), id).toEqual(order(template(id)));
      for (const entry of after.blocks) expect(withoutPosition(entry), entry.id).toEqual(withoutPosition(template(id).blocks.find((item) => item.id === entry.id)!));
      expect([...after.blocks].map((entry) => entry.position).sort((x, y) => x - y), id).toEqual(after.blocks.map((_, index) => index));
    }
    /* Une brique non concernée garde tout son contenu ; seule sa place change (le tirage vertical sort). */
    expect((await db.sessionTemplates.get("v2-muscu-a"))!.blocks.find((entry) => entry.id === "v2-muscu-a-elevations")).toEqual({ ...untouched, position: 4 });
    expect(((await db.settings.get("install"))!.value as InstallMarkers).programmeMuscu20261005).toBe(NOW);

    /* Idempotent : marqueur présent, rien ; marqueur retiré, rien non plus. */
    const templates = await db.sessionTemplates.toArray();
    const versions = await db.strengthFrameVersions.toArray();
    await seedProgramMuscu20261005("2026-10-06T08:00:00.000Z");
    const install = (await db.settings.get("install"))!.value as InstallMarkers;
    const withoutMarker: InstallMarkers = { ...install };
    delete withoutMarker.programmeMuscu20261005;
    await db.settings.put({ key: "install", value: withoutMarker });
    await seedProgramMuscu20261005("2026-10-06T09:00:00.000Z");
    expect(await db.sessionTemplates.toArray()).toEqual(templates);
    expect(await db.strengthFrameVersions.toArray()).toEqual(versions);
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]) expect(toProgramMuscu20261005((await db.sessionTemplates.get(id))!, NOW), id).toBeUndefined();
  });

  it("objectif Traction : le pullover retiré de ses exercices liés, sans remplaçant ; autres objectifs intacts ; second passage : rien", async () => {
    await installBefore();
    /* Base d'avant : l'objectif Traction lié au pullover (seed 19 du 26/09). */
    const traction = (await db.goals.where("key").equals("traction").first())!;
    const withPullover: Goal = { ...traction, linkedExercises: [{ exerciseId: "traction-assistee" }, { exerciseId: "tirage-vertical" }, { exerciseId: "rowing-poulie-basse" }, { exerciseId: "pullover-poulie" }] };
    await db.goals.put(withPullover);
    const others = (await db.goals.toArray()).filter((goal) => goal.key !== "traction");

    await seedProgramMuscu20261005(NOW);

    const after = (await db.goals.where("key").equals("traction").first())!;
    expect(after.linkedExercises.map((link) => link.exerciseId)).toEqual(["traction-assistee", "tirage-vertical", "rowing-poulie-basse"]);
    expect(after).toEqual({ ...withPullover, linkedExercises: after.linkedExercises, updatedAt: NOW });
    expect((await db.goals.toArray()).filter((goal) => goal.key !== "traction")).toEqual(others);
    expect(tractionGoalWithoutPullover(after, NOW)).toBeUndefined();
    /* Installation neuve : le programme ne lie plus le pullover, et rien ne le remplace. */
    expect(GOAL_LINKS_V2.traction).toEqual(["traction-assistee", "tirage-vertical", "rowing-poulie-basse"]);
  });

  it("modèle modifié par l'utilisateur (autres briques) : laissé tel quel", async () => {
    await installBefore();
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const custom = { ...a, blocks: a.blocks.filter((entry) => entry.id !== "v2-muscu-a-curl") };
    await db.sessionTemplates.put(custom);
    await seedProgramMuscu20261005(NOW);
    expect(await db.sessionTemplates.get("v2-muscu-a")).toEqual(custom);
  });

  it("cadres : rowing et chest press 3 × 6-8 RPE 9 (2 min 30), tirage vertical 2 × 10-15 RPE 8 ; objectifs de 40 kg effacés ; anciennes versions archivées, jamais réécrites ailleurs", async () => {
    await installBefore();
    const activeOf = async (exerciseId: string) => {
      const frame = (await db.strengthFrames.where("exerciseId").equals(exerciseId).first())!;
      return (await db.strengthFrameVersions.get(frame.activeVersionId))!;
    };
    const old = { rowing: await activeOf("rowing-poulie-basse"), chest: await activeOf("chest-press"), tirage: await activeOf("tirage-vertical") };
    expect(old.rowing.currentTarget?.value).toBe(40);
    expect(old.chest.currentTarget?.value).toBe(40);
    const others = (await db.strengthFrameVersions.toArray()).filter((version) => ![old.rowing.id, old.chest.id, old.tirage.id].includes(version.id));
    const milestones = await db.strengthMilestones.toArray();

    await seedProgramMuscu20261005(NOW);

    const rowing = await activeOf("rowing-poulie-basse");
    const chest = await activeOf("chest-press");
    const tirage = await activeOf("tirage-vertical");
    expect(rowing).toMatchObject({ number: old.rowing.number + 1, status: "active", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 9, restSec: 150, increment: old.rowing.increment, progressionType: "charge_croissante" });
    expect(chest).toMatchObject({ number: old.chest.number + 1, status: "active", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 9, restSec: 150, increment: old.chest.increment });
    expect(tirage).toMatchObject({ number: old.tirage.number + 1, status: "active", workSets: 2, repRange: { min: 10, max: 15 }, rpeTarget: 8, restSec: 120 });
    for (const version of [rowing, chest, tirage]) {
      expect(version.currentTarget, version.id).toBeUndefined();
      expect(version.firstOfficialWorkoutId, version.id).toBeUndefined();
    }
    for (const previous of [old.rowing, old.chest, old.tirage]) {
      const archived = (await db.strengthFrameVersions.get(previous.id))!;
      expect(archived).toMatchObject({ status: "archived", archiveReason: "changement_programme", archivedAt: NOW, workSets: previous.workSets, repRange: previous.repRange });
      expect(archived.currentTarget).toBeUndefined();
    }
    for (const version of others) expect(await db.strengthFrameVersions.get(version.id), version.id).toEqual(version);
    expect(await db.strengthMilestones.toArray()).toEqual(milestones);
  });

  it("16. historique, séance démarrée, séances planifiées, cardios et routines : intacts", async () => {
    await installBefore();
    const done = workout("w-done", "2026-10-04", "v2-muscu-a", [performed("v2-muscu-a-tirage-vertical", "tirage-vertical", [serie(40, 10)])]);
    const started = { ...workout("w-started", "2026-10-05", "v2-muscu-c", [performed("v2-muscu-c-pullover", "pullover-poulie", [])]), status: "in_progress" } as WorkoutSession;
    await db.workouts.bulkPut([done, started]);
    const workouts = await db.workouts.toArray();
    const planned = await db.plannedSessions.toArray();
    const otherTemplates = (await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"].includes(item.id));
    expect(otherTemplates.some((item) => item.id === "v2-cardio-a")).toBe(true);
    expect(otherTemplates.some((item) => item.category === "Routine")).toBe(true);
    const program = await db.weeklyPrograms.toArray();

    await seedProgramMuscu20261005(NOW);

    expect(await db.workouts.toArray()).toEqual(workouts);
    expect(await db.plannedSessions.toArray()).toEqual(planned);
    expect((await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"].includes(item.id))).toEqual(otherTemplates);
    expect(await db.weeklyPrograms.toArray()).toEqual(program);
  });

  it("installation neuve : A, B, C du programme dès le seed 19 ; le seed 38 met les trois cadres à jour", async () => {
    await runSeeds();
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]) expect(order((await db.sessionTemplates.get(id))!), id).toEqual(order(template(id)));
    const frame = (await db.strengthFrames.where("exerciseId").equals("rowing-poulie-basse").first())!;
    expect(await db.strengthFrameVersions.get(frame.activeVersionId)).toMatchObject({ repRange: { min: 6, max: 8 }, rpeTarget: 9 });
  });

  it("17. sauvegarde et restauration : modèles, cadres, marqueur et séances à référence propre repris à l'identique", async () => {
    await installBefore();
    await seedProgramMuscu20261005(NOW);
    await db.workouts.bulkPut(history);
    const workouts = await db.workouts.toArray();
    const templates = await db.sessionTemplates.toArray();
    const versions = await db.strengthFrameVersions.toArray();
    const file = parseBackup(serializeBackup(await readBackup(db, { now: new Date(NOW), buildTime: "b", userAgent: "t", standalone: true })));
    await db.delete();
    await db.open();
    await restoreBackup(file, db);
    expect(await db.workouts.toArray()).toEqual(workouts);
    const restored = (await db.workouts.get("w-b-1013"))!.blocks.find((entry) => entry.kind === "exercise" && entry.sourceBlockId === "v2-muscu-b-rowing") as PerformedExerciseBlock;
    expect([restored.ownReference, restored.outsideFrame, restored.reducedPrescription]).toEqual([true, true, true]);
    expect(findLastOwnBlockPerformances(await db.workouts.toArray(), "v2-muscu-b").get("v2-muscu-b-rowing")?.series.load).toEqual({ kind: "total", kg: 45 });
    expect(await db.sessionTemplates.toArray()).toEqual(templates);
    expect(await db.strengthFrameVersions.toArray()).toEqual(versions);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).programmeMuscu20261005).toBe(NOW);
  });
});

/* -------------------------------------------------------------------------- */
/* ownReference : capturé dans la séance, jamais relu dans le modèle actuel   */
/* -------------------------------------------------------------------------- */

describe("ownReference : figé dans la séance au démarrage", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  const rowingOf = (session: WorkoutSession) => session.blocks.find((entry) => entry.kind === "exercise" && entry.sourceBlockId === "v2-muscu-b-rowing") as PerformedExerciseBlock;

  it("capturé dans le snapshot : rowing de B et chest press de A seulement (ni la traction légère, ni la leg press)", () => {
    const b = createWorkoutSnapshot(template("v2-muscu-b"));
    const a = createWorkoutSnapshot(template("v2-muscu-a"));
    const flagged = [...a, ...b].filter((entry) => entry.kind === "exercise" && entry.ownReference === true).map((entry) => entry.kind !== "test" && entry.sourceBlockId);
    expect(flagged).toEqual(["v2-muscu-a-chest-press", "v2-muscu-b-rowing"]);
  });

  it("séance démarrée puis modèle modifié (drapeau retiré) : la séance garde son drapeau et sa référence propre ; rien n'est réécrit", async () => {
    await db.workouts.bulkPut(history);
    const started = await startFreeWorkout("2026-10-20", "2026-10-20T08:00:00.000Z", (await db.sessionTemplates.get("v2-muscu-b"))!);
    expect(rowingOf(started).ownReference).toBe(true);
    const stored = await db.workouts.get(started.id);

    /* Le modèle change ensuite : le rowing de B perd son drapeau (et passerait dans le cadre). */
    const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
    await db.sessionTemplates.put({
      ...b,
      blocks: b.blocks.map((entry) => {
        if (entry.id !== "v2-muscu-b-rowing" || entry.kind !== "exercise") return entry;
        const changed = { ...entry };
        delete changed.ownReference;
        delete changed.outsideFrame;
        return changed;
      }),
    });

    /* La séance démarrée et l'historique ne bougent pas. */
    expect(await db.workouts.get(started.id)).toEqual(stored);
    for (const done of history) expect(await db.workouts.get(done.id), done.id).toEqual(done);
    /* Le comportement suit la séance, pas le modèle actuel : toujours les 45 kg du rowing de B, jamais les 60 kg de A. */
    const current = rowingOf((await db.workouts.get(started.id))!);
    const completed = (await db.workouts.toArray()).filter((entry) => entry.status === "completed");
    expect(lastTimeOf(current, findLastPerformances(completed, started.id), findLastOwnBlockPerformances(completed, "v2-muscu-b", started.id))?.series.load).toEqual({ kind: "total", kg: 45 });
    /* Et la brique lourde de A ignore toujours le volume enregistré avec le drapeau. */
    expect(findLastPerformances(completed).get("rowing-poulie-basse")?.series.load).toEqual({ kind: "total", kg: 60 });
  });

  it("séance faite sans drapeau (avant le programme du 05/10) : jamais reclassée par le modèle actuel", () => {
    const old = workout("w-old", "2026-10-06", "v2-muscu-b", [performed("v2-muscu-b-rowing", "rowing-poulie-basse", [serie(50, 10)])]);
    expect(findLastOwnBlockPerformances([old], "v2-muscu-b").size).toBe(0);
    expect(findLastPerformances([old]).get("rowing-poulie-basse")?.series.load).toEqual({ kind: "total", kg: 50 });
  });
});

/* -------------------------------------------------------------------------- */
/* 18. Sauvegarde réelle                                                      */
/* -------------------------------------------------------------------------- */

const REAL = process.env.COACH_JM_BACKUP ?? "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-05-0819.json";
const realPath = existsSync(REAL) ? REAL : undefined;

describe("18. sauvegarde réelle", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  it.skipIf(!realPath)("seed 38 sur la base réelle : A, B, C du programme, trois cadres ; séances, jalons, cardios, routines et pari V6 intacts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await resetAndRestore(parseBackup(await readFile(realPath!, "utf8")), db);
    resumeSeedsForTests();
    await runSeeds(SEEDS.filter((seed) => seed.name !== "programmeMuscu20261005" && seed.name !== "programmeMuscuC20261009"));
    const workouts = await db.workouts.toArray();
    const milestones = await db.strengthMilestones.toArray();
    const planned = await db.plannedSessions.toArray();
    const others = (await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"].includes(item.id));
    const goals = await db.goals.toArray();
    const until = "2026-10-05";
    const v6Before = v6State(workouts, until);
    const tractionFrame = (await db.strengthFrames.where("exerciseId").equals("traction-assistee").first())!;
    const tractionVersions = await db.strengthFrameVersions.where("frameId").equals(tractionFrame.id).toArray();

    resumeSeedsForTests();
    /* Le seed 39 (Muscu C du 09/10, Routine A) a son propre test sur la base réelle. */
    const report = await runSeeds(SEEDS.filter((seed) => seed.name !== "programmeMuscuC20261009"));
    expect(report.failed).toEqual([]);

    for (const id of ["v2-muscu-a", "v2-muscu-b"]) {
      const after = (await db.sessionTemplates.get(id))!;
      expect(order(after), id).toEqual(order(template(id)));
    }
    /* Muscu C : la définition du 09/10 sur une base d'avant le seed 38 (il la reconstruit) ; sur une base où le
       seed 38 était déjà passé, la C du 05/10 — le seed 39, exclu ici, a son propre test sur base réelle. */
    const c = order((await db.sessionTemplates.get("v2-muscu-c"))!);
    expect([order(template("v2-muscu-c")).join(), [...MUSCU_C_BLOCKS_BEFORE_20261009].sort().join()]).toContain(
      c.join() === order(template("v2-muscu-c")).join() ? c.join() : [...c].sort().join(),
    );
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect(await db.strengthMilestones.toArray()).toEqual(milestones);
    expect(await db.plannedSessions.toArray()).toEqual(planned);
    expect((await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"].includes(item.id))).toEqual(others);
    expect(await db.strengthFrameVersions.where("frameId").equals(tractionFrame.id).toArray()).toEqual(tractionVersions);
    /* Objectifs : seul le pullover quitte l'objectif Traction. */
    const goalsAfter = await db.goals.toArray();
    expect(goalsAfter.filter((goal) => goal.key !== "traction")).toEqual(goals.filter((goal) => goal.key !== "traction"));
    const tractionBefore = goals.find((goal) => goal.key === "traction")!;
    expect(goalsAfter.find((goal) => goal.key === "traction")!.linkedExercises).toEqual(tractionBefore.linkedExercises.filter((link) => link.exerciseId !== "pullover-poulie"));
    /* Pari V6 : même état (A 28, B 42 sur la sauvegarde du 05/10). */
    const v6After = v6State(await db.workouts.toArray(), until);
    expect(v6After).toEqual(v6Before);
    for (const exerciseId of ["rowing-poulie-basse", "chest-press", "tirage-vertical"]) {
      const frame = (await db.strengthFrames.where("exerciseId").equals(exerciseId).first())!;
      expect((await db.strengthFrameVersions.get(frame.activeVersionId))!.currentTarget, exerciseId).toBeUndefined();
    }
  }, 30000);
});
