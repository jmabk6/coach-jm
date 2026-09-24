import { db } from "../../db/database";
import type { Id, InstallMarkers, StrengthFrame, StrengthFrameVersion } from "../../domain";
import { assertFrameInput, type FrameVersionInput } from "./frameActions";

/**
 * Seed 7 (SCHEMA_DEXIE_V3_MIGRATION.md § 5.2 ; conception V2 § 2.5.1,
 * D18, D19) : un cadre par exercice de musculation à charge du programme
 * V1, avec sa **première cible** — le programme validé vaut autorisation
 * initiale : `currentTarget` = la charge du programme, `acceptedAt` = la
 * date d'installation, sans `fromMilestoneId`.
 *
 * - Un exercice qui a **déjà** un cadre n'en reçoit pas un second (tenu
 *   ici : l'index `exerciseId` n'est pas unique) ; l'existant n'est pas
 *   touché (T-21 : `tirage-vertical`, cible 40 kg, dans la sauvegarde du 23/09).
 * - Charges « à étalonner » (développé incliné, pullover) et non
 *   indiquées (mollets debout) : cadre **sans cible**.
 * - Traction assistée : **sans incrément** tant que le cran de la
 *   machine n'est pas saisi (D18) ; aucune hausse n'est proposée.
 * - Charges à jour du 24/09 : rowing poulie basse 40 kg, leg curl 32,5 kg.
 */

interface FrameSpec {
  exerciseId: Id;
  input: FrameVersionInput;
  /** Première cible (kg) ; absente = à étalonner. */
  target?: number;
}

const upper = (workSets: number, min: number, max: number, restSec: number): FrameVersionInput => ({
  progressionType: "charge_croissante",
  workSets,
  repRange: { min, max },
  rpeTarget: 8,
  restSec,
  increment: { unit: "kg", value: 2.5 },
});

const legs = (workSets: number, min: number, max: number, restSec: number): FrameVersionInput => ({
  ...upper(workSets, min, max, restSec),
  increment: { unit: "kg", value: 5 },
});

export const PROGRAM_V1_FRAMES: FrameSpec[] = [
  {
    exerciseId: "traction-assistee",
    input: { progressionType: "assistance_decroissante", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 8, restSec: 150 },
    target: 52,
  },
  { exerciseId: "squat", input: { ...legs(3, 8, 10, 120), barWeightKg: 20 }, target: 35 },
  { exerciseId: "rowing-poulie-basse", input: upper(3, 8, 12, 90), target: 40 },
  { exerciseId: "chest-press", input: upper(3, 8, 12, 90), target: 37.5 },
  { exerciseId: "leg-curl-assis", input: legs(3, 10, 12, 90), target: 32.5 },
  {
    exerciseId: "elevations-laterales-halteres",
    /* Plus petit écart d'haltères disponible : 1 kg par défaut, modifiable. */
    input: { ...upper(2, 12, 15, 90), increment: { unit: "kg", value: 1 } },
    target: 5,
  },
  { exerciseId: "developpe-epaules-machine", input: upper(3, 8, 10, 90), target: 27.5 },
  { exerciseId: "presse-cuisses", input: legs(3, 10, 12, 120), target: 130 },
  { exerciseId: "developpe-incline-halteres", input: upper(3, 8, 12, 90) },
  { exerciseId: "tirage-vertical", input: upper(3, 8, 12, 90), target: 40 },
  { exerciseId: "extension-triceps-poulie", input: upper(2, 10, 15, 60), target: 15 },
  { exerciseId: "pullover-poulie", input: upper(3, 10, 15, 90) },
  /* Groupe « Rester bas » : 3 tours, 90 s entre les tours. */
  { exerciseId: "mollets-debout", input: legs(3, 15, 20, 90) },
];

export function programFrameIds(exerciseId: Id): { frameId: Id; versionId: Id } {
  const frameId = `frame-v1-${exerciseId}`;
  return { frameId, versionId: `${frameId}-v1` };
}

export async function seedProgramFrames(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.strengthFrames, db.strengthFrameVersions, db.exercises, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.frames !== undefined) return;

    for (const spec of PROGRAM_V1_FRAMES) {
      const exercise = await db.exercises.get(spec.exerciseId);
      if (!exercise) throw new Error(`Exercice du programme absent : ${spec.exerciseId}`);

      if ((await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).count()) > 0) continue;

      assertFrameInput(exercise, spec.input);
      const { frameId, versionId } = programFrameIds(spec.exerciseId);
      const version: StrengthFrameVersion = {
        id: versionId,
        frameId,
        number: 1,
        status: "active",
        ...structuredClone(spec.input),
        ...(spec.target !== undefined ? { currentTarget: { value: spec.target, unit: "kg" as const, acceptedAt: now } } : {}),
        createdAt: now,
        updatedAt: now,
      };
      const frame: StrengthFrame = { id: frameId, exerciseId: spec.exerciseId, activeVersionId: versionId, createdAt: now, updatedAt: now };

      await db.strengthFrameVersions.add(version);
      await db.strengthFrames.add(frame);
    }

    await db.settings.put({ key: "install", value: { ...install, frames: now } });
  });
}
