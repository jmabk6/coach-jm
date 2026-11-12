import { db } from "../../db/database";
import type { InstallMarkers, WorkoutSession } from "../../domain";

/**
 * Seed 59 — correction ponctuelle de la Muscu B du 10/11/2026 (message de
 * l'utilisateur, sauvegarde du 10/11 à 20:16) : la dernière série du
 * développé épaules machine a été notée **10 kg** ; c'était **20 kg**, comme
 * les deux premières (3 × 20 kg). Répétitions (10) et RPE (9) inchangés.
 *
 * Une seule fois (marqueur `install.fixDeveloppeEpaules20261110`), et
 * seulement si la série est **exactement** dans l'état constaté ; sinon rien
 * n'est touché.
 */

export const FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID = "workout-weekly-2026-11-10";
const BLOCK_ID = "workout-block-v2-muscu-b-developpe-epaules";
const LAST_SET_ID = `${BLOCK_ID}-set-3`;
const LAST_SET_COMPLETED_AT = "2026-11-10T14:39:17.171Z";

/** La séance corrigée, ou `undefined` si elle n'est pas dans l'état constaté. */
export function fixDeveloppeEpaules20261110(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  const block = workout.blocks.find((item) => item.id === BLOCK_ID);
  const last = block?.kind === "exercise" ? block.series?.find((item) => item.id === LAST_SET_ID) : undefined;
  if (
    workout.id !== FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID ||
    workout.status !== "completed" ||
    !last ||
    last.status !== "completed" ||
    last.completedAt !== LAST_SET_COMPLETED_AT ||
    last.load?.kind !== "total" ||
    last.load.kg !== 10 ||
    last.reps !== 10 ||
    last.rpe !== 9
  ) {
    return undefined;
  }

  return {
    ...workout,
    blocks: workout.blocks.map((item) =>
      item.id === BLOCK_ID && item.kind === "exercise"
        ? { ...item, series: item.series!.map((series) => (series.id === LAST_SET_ID ? { ...series, load: { kind: "total" as const, kg: 20 } } : series)) }
        : item,
    ),
    updatedAt: now,
  };
}

export async function seedFixDeveloppeEpaules20261110(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.fixDeveloppeEpaules20261110 !== undefined) return;

    const workout = await db.workouts.get(FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID);
    const fixed = workout ? fixDeveloppeEpaules20261110(workout, now) : undefined;
    if (fixed) await db.workouts.put(fixed);

    await db.settings.put({ key: "install", value: { ...install, fixDeveloppeEpaules20261110: now } });
  });
}
