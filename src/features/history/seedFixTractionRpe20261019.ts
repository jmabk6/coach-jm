import { db } from "../../db/database";
import type { InstallMarkers, WorkoutSession } from "../../domain";

/**
 * Seed 41 — correction ponctuelle de la Muscu A du 19/10/2026 (message de
 * l'utilisateur, sauvegarde du 19/10 à 20:34) : la dernière série de
 * traction assistée, 28 kg × 5, a été notée **RPE 5** ; c'était **RPE 9**.
 *
 * Sans autre effet : le cadre (RPE ≤ 9) et le pari V6 (RPE 9 au plus)
 * acceptent RPE 9 ; le palier validé de 28 kg et son jalon restent.
 *
 * Une seule fois (marqueur `install.fixTractionRpe20261019`), et seulement
 * si la série est **exactement** dans l'état constaté ; sinon rien n'est
 * touché.
 */

export const FIX_TRACTION_RPE_20261019_WORKOUT_ID = "workout-weekly-2026-10-18";
const TRACTION_BLOCK_ID = "workout-block-v2-muscu-a-traction";
const LAST_SET_ID = `${TRACTION_BLOCK_ID}-set-3`;
const LAST_SET_COMPLETED_AT = "2026-10-19T13:59:44.484Z";

/** La séance corrigée, ou `undefined` si elle n'est pas dans l'état constaté. */
export function fixTractionRpe20261019(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  const block = workout.blocks.find((item) => item.id === TRACTION_BLOCK_ID);
  const last = block?.kind === "exercise" ? block.series?.find((item) => item.id === LAST_SET_ID) : undefined;
  if (
    workout.id !== FIX_TRACTION_RPE_20261019_WORKOUT_ID ||
    workout.status !== "completed" ||
    !last ||
    last.status !== "completed" ||
    last.completedAt !== LAST_SET_COMPLETED_AT ||
    last.load?.kind !== "total" ||
    last.load.kg !== 28 ||
    last.reps !== 5 ||
    last.rpe !== 5
  ) {
    return undefined;
  }

  return {
    ...workout,
    blocks: workout.blocks.map((item) =>
      item.id === TRACTION_BLOCK_ID && item.kind === "exercise"
        ? { ...item, series: item.series!.map((series) => (series.id === LAST_SET_ID ? { ...series, rpe: 9 } : series)) }
        : item,
    ),
    updatedAt: now,
  };
}

export async function seedFixTractionRpe20261019(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.fixTractionRpe20261019 !== undefined) return;

    const workout = await db.workouts.get(FIX_TRACTION_RPE_20261019_WORKOUT_ID);
    const fixed = workout ? fixTractionRpe20261019(workout, now) : undefined;
    if (fixed) await db.workouts.put(fixed);

    await db.settings.put({ key: "install", value: { ...install, fixTractionRpe20261019: now } });
  });
}
