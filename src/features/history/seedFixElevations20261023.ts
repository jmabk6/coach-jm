import { db } from "../../db/database";
import type { InstallMarkers, WorkoutSession } from "../../domain";

/**
 * Seed 46 — correction ponctuelle de la Muscu C du 23/10/2026 (message de
 * l'utilisateur, sauvegarde du 24/10 à 00:02) : la dernière série
 * d'élévations latérales, 5 kg par haltère, a été notée **15 répétitions à
 * RPE 11** ; c'était **11 répétitions à RPE 9**.
 *
 * Sans autre effet : aucun jalon n'avait été créé sur cette série (RPE 11
 * au-dessus du plafond), et la correction (11 < 15) n'en crée pas.
 *
 * Une seule fois (marqueur `install.fixElevations20261023`), et seulement si
 * la série est **exactement** dans l'état constaté ; sinon rien n'est touché.
 */

export const FIX_ELEVATIONS_20261023_WORKOUT_ID = "workout-weekly-2026-10-22";
const ELEVATIONS_BLOCK_ID = "workout-block-v2-muscu-c-elevations";
const LAST_SET_ID = `${ELEVATIONS_BLOCK_ID}-set-3`;
const LAST_SET_COMPLETED_AT = "2026-10-23T12:08:32.502Z";

/** La séance corrigée, ou `undefined` si elle n'est pas dans l'état constaté. */
export function fixElevations20261023(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  const block = workout.blocks.find((item) => item.id === ELEVATIONS_BLOCK_ID);
  const last = block?.kind === "exercise" ? block.series?.find((item) => item.id === LAST_SET_ID) : undefined;
  if (
    workout.id !== FIX_ELEVATIONS_20261023_WORKOUT_ID ||
    workout.status !== "completed" ||
    !last ||
    last.status !== "completed" ||
    last.completedAt !== LAST_SET_COMPLETED_AT ||
    last.load?.kind !== "total" ||
    last.load.kg !== 5 ||
    last.reps !== 15 ||
    last.rpe !== 11
  ) {
    return undefined;
  }

  return {
    ...workout,
    blocks: workout.blocks.map((item) =>
      item.id === ELEVATIONS_BLOCK_ID && item.kind === "exercise"
        ? { ...item, series: item.series!.map((series) => (series.id === LAST_SET_ID ? { ...series, reps: 11, rpe: 9 } : series)) }
        : item,
    ),
    updatedAt: now,
  };
}

export async function seedFixElevations20261023(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.fixElevations20261023 !== undefined) return;

    const workout = await db.workouts.get(FIX_ELEVATIONS_20261023_WORKOUT_ID);
    const fixed = workout ? fixElevations20261023(workout, now) : undefined;
    if (fixed) await db.workouts.put(fixed);

    await db.settings.put({ key: "install", value: { ...install, fixElevations20261023: now } });
  });
}
