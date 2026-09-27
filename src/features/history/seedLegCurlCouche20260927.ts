import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, PerformedSeries, WorkoutSession } from "../../domain";

/**
 * Seed 21 — correction ponctuelle de la Muscu A du 27/09/2026 : le leg curl
 * assis a été retiré de la séance et remplacé, à la salle, par du **leg
 * curl couché** — 3 séries de 10 à 20 kg, RPE 8, 8 et 9 (message de
 * l'utilisateur). Le bloc est ajouté à sa place, entre le chest press et
 * les élévations latérales. Sans cadre (le leg curl couché n'en avait pas
 * le 27/09) : ni jalon ni stagnation. Repos non mesurés : hors repos moyen.
 *
 * La séance s'est arrêtée après les élévations (dernière série à 14:45:42,
 * heure de Paris), la fin n'a été saisie qu'à 17:34 : la durée active
 * devient 1 h 21 min 30 s (début 13:24:12 → dernière série), et le « repos »
 * de 2 h 48 après la dernière série sort du repos moyen, comme un repos
 * clôturé par la fin de séance.
 *
 * Même méthode que la correction du 24/09 : une seule fois (marqueur
 * `install.legCurlCouche20260927`), et seulement si la séance est
 * **exactement** dans l'état de la sauvegarde du 27/09 à 17:34 ; sinon
 * rien n'est touché.
 */

export const LEG_CURL_WORKOUT_ID = "workout-weekly-2026-09-27";
export const LEG_CURL_BLOCK_ID = "workout-block-correction-2026-09-27-leg-curl-couche";

const CHEST_PRESS_BLOCK_ID = "workout-block-v1-muscu-a-chest-press";
const CHEST_PRESS_LAST_SET_AT = "2026-09-27T12:27:48.387Z";
const ELEVATIONS_BLOCK_ID = "workout-block-v1-muscu-a-elevations";
const ELEVATIONS_FIRST_SET_AT = "2026-09-27T12:40:45.914Z";
const ELEVATIONS_LAST_SET_AT = "2026-09-27T12:45:41.955Z";
const OBSERVED_ACTIVE_SEC = 14999;
/** Début (11:24:12.118Z) → dernière série des élévations (12:45:41.955Z). */
const ACTIVE_SEC = 4890;

/** Heures reconstituées, entre la dernière série du chest press et la première des élévations. */
const SETS: ReadonlyArray<{ rpe: number; completedAt: string }> = [
  { rpe: 8, completedAt: "2026-09-27T12:34:00.000Z" },
  { rpe: 8, completedAt: "2026-09-27T12:36:00.000Z" },
  { rpe: 9, completedAt: "2026-09-27T12:38:00.000Z" },
];

function exerciseBlock(workout: WorkoutSession, id: string): PerformedExerciseBlock | undefined {
  const block = workout.blocks.find((item) => item.id === id);
  return block?.kind === "exercise" ? block : undefined;
}

function matchesObservedState(workout: WorkoutSession): boolean {
  if (workout.status !== "completed" || workout.activeDurationSec !== OBSERVED_ACTIVE_SEC) return false;
  if (workout.blocks.some((block) => block.kind === "exercise" && (block.exerciseId === "leg-curl-assis" || block.exerciseId === "leg-curl-couche"))) return false;
  const chest = exerciseBlock(workout, CHEST_PRESS_BLOCK_ID);
  const elevations = exerciseBlock(workout, ELEVATIONS_BLOCK_ID);
  return (
    chest?.series?.at(-1)?.completedAt === CHEST_PRESS_LAST_SET_AT &&
    elevations?.series?.[0]?.completedAt === ELEVATIONS_FIRST_SET_AT &&
    elevations.series.at(-1)?.completedAt === ELEVATIONS_LAST_SET_AT &&
    elevations.position === chest.position + 1
  );
}

/** La séance corrigée, ou `undefined` si elle n'est pas dans l'état attendu. */
export function addLegCurlCouche20260927(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  if (!matchesObservedState(workout)) return undefined;

  const position = exerciseBlock(workout, ELEVATIONS_BLOCK_ID)!.position;
  const series: PerformedSeries[] = SETS.map((set, index) => ({
    id: `${LEG_CURL_BLOCK_ID}-set-${index + 1}`,
    position: index,
    status: "completed",
    role: "travail",
    load: { kind: "total", kg: 20 },
    reps: 10,
    rpe: set.rpe,
    sideLimited: false,
    completedAt: set.completedAt,
    restComparable: false,
  }));
  const block: PerformedExerciseBlock = {
    id: LEG_CURL_BLOCK_ID,
    kind: "exercise",
    position,
    addedDuringWorkout: true,
    exerciseId: "leg-curl-couche",
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
    series,
    note: "Ajouté après coup (correction du 27/09) : fait à la place du leg curl assis.",
  };

  /* Le « repos » après la dernière série : clôturé par la fin de séance, hors repos moyen. */
  const lastRestClosed = (item: WorkoutSession["blocks"][number]) =>
    item.id === ELEVATIONS_BLOCK_ID && item.kind === "exercise"
      ? { ...item, series: item.series!.map((set) => (set.completedAt === ELEVATIONS_LAST_SET_AT ? { ...set, restComparable: false } : set)) }
      : item;

  return {
    ...workout,
    blocks: [...workout.blocks.map((item) => lastRestClosed(item.position >= position ? { ...item, position: item.position + 1 } : item)), block],
    activeDurationSec: ACTIVE_SEC,
    updatedAt: now,
  };
}

export async function seedLegCurlCouche20260927(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.legCurlCouche20260927 !== undefined) return;

    const workout = await db.workouts.get(LEG_CURL_WORKOUT_ID);
    const fixed = workout ? addLegCurlCouche20260927(workout, now) : undefined;
    if (fixed) await db.workouts.put(fixed);

    await db.settings.put({ key: "install", value: { ...install, legCurlCouche20260927: now } });
  });
}
