import { db } from "../../db/database";
import type { Exercise, Id, InstallMarkers, LoadSteps, ProgressionTrack, SessionTemplate, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { frameVersion20261005 } from "../program/seedProgramMuscu20261005";
import { buildTrack, detailedTrajectory, trackSpecsFrom } from "./tracks";

/**
 * Perspectives au 31 mars, mise en place (lot P1, 22/10/2026).
 *
 * Seed 42 — crans réels confirmés par l'utilisateur le 22/10/2026.
 * Seed 43 — développé épaules machine : plafond RPE 9 (le 8 était la valeur
 *           par défaut des cadres V2, jamais décidée).
 * Seed 44 — les pistes A/B/C et leurs trajectoires initiales ; presse à
 *           cuisses (A et B) en progression suspendue.
 * Seed 45 — référence détaillée, datée (objectif de chaque série, semaine
 *           par semaine) ajoutée aux pistes ; la trajectoire initiale garde
 *           son sens d'origine (repère de meilleure série). Repassé à chaque
 *           lancement : une piste dont le rythme était inconnu reçoit la
 *           sienne, datée, dès qu'il est connu ; aucune n'est réécrite.
 *
 * Chacun une seule fois (marqueur), sans jamais écraser une donnée déjà là.
 */

const MACHINE_5: LoadSteps = { base: 5, step: 5 };
const POULIE_2_5: LoadSteps = { base: 2.5, step: 2.5 };
/** Haltères : 4, 5, 6 kg, puis de 2 en 2 (8, 10, 12…) ; charge notée par haltère. */
const HALTERES: LoadSteps = { base: 6, step: 2, below: [4, 5] };

export const LOAD_STEPS_20261022: Readonly<Record<Id, LoadSteps>> = {
  "chest-press": MACHINE_5,
  "leg-curl-couche": MACHINE_5,
  "developpe-epaules-machine": MACHINE_5,
  "rowing-poulie-basse": MACHINE_5,
  "tirage-vertical": MACHINE_5,
  "presse-cuisses": { base: 10, step: 10 },
  "extension-triceps-poulie": POULIE_2_5,
  "extension-triceps-dessus-tete": POULIE_2_5,
  "face-pull": POULIE_2_5,
  "ecarte-poulie": POULIE_2_5,
  "developpe-incline-halteres": HALTERES,
  "elevations-laterales-halteres": HALTERES,
  "curl-halteres": HALTERES,
  "curl-marteau-halteres": HALTERES,
  /* Traction assistée : crans de 7 kg du pari (assistance). */
  "traction-assistee": { base: 0, step: 7 },
};

async function markers(): Promise<InstallMarkers | undefined> {
  return (await db.settings.get("install"))?.value as InstallMarkers | undefined;
}

export async function seedLoadSteps20261022(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.exercises, db.settings, async () => {
    const install = await markers();
    if (install?.loadSteps20261022 !== undefined) return;
    for (const [exerciseId, steps] of Object.entries(LOAD_STEPS_20261022)) {
      const exercise = await db.exercises.get(exerciseId);
      if (exercise && exercise.loadSteps === undefined) await db.exercises.put({ ...exercise, loadSteps: { ...steps, ...(steps.below ? { below: [...steps.below] } : {}) }, updatedAt: now });
    }
    await db.settings.put({ key: "install", value: { ...install, loadSteps20261022: now } });
  });
}

const SHOULDER_SPEC = { exerciseId: "developpe-epaules-machine", workSets: 3, repRange: { min: 8, max: 10 }, rpeTarget: 9 } as const;

/** La nouvelle version du cadre des épaules, ou `undefined` si la version active n'est pas celle attendue (3 × 8–10, RPE 8). */
export function shoulderVersion20261022(active: StrengthFrameVersion, number: number, now: string) {
  if (active.status !== "active" || active.workSets !== 3 || active.repRange?.min !== 8 || active.repRange.max !== 10 || active.rpeTarget !== 8) return undefined;
  return frameVersion20261005(active, number, { ...SHOULDER_SPEC, repRange: { ...SHOULDER_SPEC.repRange }, restSec: active.restSec }, now);
}

export async function seedShoulderRpe20261022(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.strengthFrames, db.strengthFrameVersions, db.settings], async () => {
    const install = await markers();
    if (install?.shoulderRpe20261022 !== undefined) return;
    const frame = await db.strengthFrames.where("exerciseId").equals(SHOULDER_SPEC.exerciseId).first();
    if (frame) {
      const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();
      const active = versions.find((version) => version.id === frame.activeVersionId);
      const change = active ? shoulderVersion20261022(active, Math.max(0, ...versions.map((version) => version.number)) + 1, now) : undefined;
      if (change) {
        await db.strengthFrameVersions.put(change.archived);
        await db.strengthFrameVersions.add(change.next);
        await db.strengthFrames.put({ ...frame, activeVersionId: change.next.id, updatedAt: now });
      }
    }
    await db.settings.put({ key: "install", value: { ...install, shoulderRpe20261022: now } });
  });
}

/** Presse à cuisses : hausses suspendues en attendant de clarifier les douleurs lombaires. */
export const SUSPENDED_20261022: Readonly<Record<Id, string>> = { "presse-cuisses": "douleurs lombaires à clarifier" };

/** Les pistes à créer, calculées sur la base telle qu'elle est (fonction pure, pour les tests). */
export function perspectiveTracks20261022(
  templates: ReadonlyArray<SessionTemplate>,
  exercises: ReadonlyArray<Exercise>,
  activeVersions: ReadonlyArray<StrengthFrameVersion>,
  frameExercise: ReadonlyMap<Id, Id>,
  workouts: ReadonlyArray<WorkoutSession>,
  now: string,
  today: string,
): ProgressionTrack[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const versionByExercise = new Map(activeVersions.flatMap((version) => {
    const exerciseId = frameExercise.get(version.frameId);
    return exerciseId ? [[exerciseId, version] as const] : [];
  }));
  const specs = trackSpecsFrom(templates, exerciseById, versionByExercise);
  return specs.map((spec) => {
    const track = buildTrack(spec, specs, workouts, exerciseById.get(spec.exerciseId)?.loadSteps, now, today);
    const reason = SUSPENDED_20261022[spec.exerciseId];
    /* Suspendue : aucune trajectoire (elle ressemblerait à une recommandation) ; elle sera calculée à la reprise. */
    if (!reason) return track;
    const rest = { ...track };
    delete rest.detailed;
    return { ...rest, initial: { createdAt: now, weeks: [], provisional: true }, suspension: { from: today, reason } };
  });
}

export async function seedPerspectiveTracks20261022(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.exercises, db.strengthFrames, db.strengthFrameVersions, db.workouts, db.settings], async () => {
    const install = await markers();
    if (install?.perspectiveTracks20261022 !== undefined) return;
    if (!(await db.settings.get("progressionTracks"))) {
      const [templates, exercises, frames, versions, workouts] = await Promise.all([
        db.sessionTemplates.toArray(),
        db.exercises.toArray(),
        db.strengthFrames.toArray(),
        db.strengthFrameVersions.where("status").equals("active").toArray(),
        db.workouts.where("status").equals("completed").toArray(),
      ]);
      const tracks = perspectiveTracks20261022(
        templates as SessionTemplate[],
        exercises as Exercise[],
        versions as StrengthFrameVersion[],
        new Map(frames.map((frame) => [frame.id, frame.exerciseId])),
        workouts as WorkoutSession[],
        now,
        formatLocalDate(new Date(now)),
      );
      if (tracks.length > 0) await db.settings.put({ key: "progressionTracks", value: tracks });
    }
    await db.settings.put({ key: "install", value: { ...(await markers()), perspectiveTracks20261022: now } });
  });
}

/** Les pistes complétées d'une référence détaillée datée (fonction pure) ; celles qui en ont déjà une sont intactes. */
export function withDetailedReferences(
  tracks: ReadonlyArray<ProgressionTrack>,
  templates: ReadonlyArray<SessionTemplate>,
  exercises: ReadonlyArray<Exercise>,
  activeVersions: ReadonlyArray<StrengthFrameVersion>,
  frameExercise: ReadonlyMap<Id, Id>,
  workouts: ReadonlyArray<WorkoutSession>,
  now: string,
  today: string,
): ProgressionTrack[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const versionByExercise = new Map(activeVersions.flatMap((version) => {
    const exerciseId = frameExercise.get(version.frameId);
    return exerciseId ? [[exerciseId, version] as const] : [];
  }));
  const specs = trackSpecsFrom(templates, exerciseById, versionByExercise);
  return tracks.map((track) => {
    const spec = specs.find((item) => item.id === track.id);
    if (track.detailed || track.suspension || track.closedAt || !spec) return track;
    const reference = track.references.at(-1);
    const detailed = detailedTrajectory(reference ? { ...spec, reference } : spec, specs, workouts, exerciseById.get(spec.exerciseId)?.loadSteps, now, today);
    return detailed ? { ...track, detailed } : track;
  });
}

export async function seedDetailedReferences20261022(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.exercises, db.strengthFrames, db.strengthFrameVersions, db.workouts, db.settings], async () => {
    const install = await markers();
    const stored = (await db.settings.get("progressionTracks"))?.value as ProgressionTrack[] | undefined;
    const pending = (stored ?? []).some((track) => !track.detailed && !track.suspension && !track.closedAt && (track.engine === "load" || track.engine === "duration"));
    if (stored && pending) {
      const [templates, exercises, frames, versions, workouts] = await Promise.all([
        db.sessionTemplates.toArray(),
        db.exercises.toArray(),
        db.strengthFrames.toArray(),
        db.strengthFrameVersions.where("status").equals("active").toArray(),
        db.workouts.where("status").equals("completed").toArray(),
      ]);
      const tracks = withDetailedReferences(
        stored,
        templates as SessionTemplate[],
        exercises as Exercise[],
        versions as StrengthFrameVersion[],
        new Map(frames.map((frame) => [frame.id, frame.exerciseId])),
        workouts as WorkoutSession[],
        now,
        formatLocalDate(new Date(now)),
      );
      if (tracks.some((track, index) => track !== stored[index])) await db.settings.put({ key: "progressionTracks", value: tracks });
    }
    if (install?.perspectiveDetailed20261022 === undefined) await db.settings.put({ key: "install", value: { ...(await markers()), perspectiveDetailed20261022: now } });
  });
}
