import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, PerformedSeries, WorkoutSession } from "../../domain";

/**
 * Seed 31 — correction ponctuelle de la Muscu A du 04/10/2026 (message de
 * l'utilisateur, sauvegarde du 04/10 à 17:05) :
 * - traction assistée : une 4e série oubliée, **28 kg × 3**, après les
 *   trois séries à 35 kg × 5 (heure reconstituée, repos non mesuré : hors
 *   repos moyen). Le 5/5/5 à 35 kg reste : le palier A passe à 28 kg ;
 * - le curl barre EZ noté n'a pas été fait : c'était du **curl haltères**,
 *   bras alternés, 3 × 8 à 6 kg, RPE 8 (mêmes heures). Le curl haltères n'a
 *   pas de cadre : la brique perd celui du curl EZ ; le jalon « validé » du
 *   curl EZ créé à la clôture est retiré, et la version du cadre du curl EZ,
 *   figée par cette seule séance, se défige.
 *
 * Une seule fois (marqueur `install.fixWorkout20261004`), et seulement si
 * la séance est **exactement** dans l'état de la sauvegarde du 04/10 à
 * 17:05 ; sinon rien n'est touché.
 */

export const FIX_WORKOUT_ID = "workout-weekly-2026-10-04";
const TRACTION_BLOCK_ID = "workout-block-v2-muscu-a-traction";
const CURL_BLOCK_ID = "workout-block-v2-muscu-a-curl";
const TRACTION_LAST_SET_AT = "2026-10-04T12:34:31.777Z";
const CURL_FIRST_SET_AT = "2026-10-04T13:39:56.897Z";
const CURL_EZ_VERSION_ID = "frame-v2-import-curl-biceps-ez-v1";
export const CURL_EZ_MILESTONE_ID = `milestone-${FIX_WORKOUT_ID}-${CURL_EZ_VERSION_ID}`;
/** Après la 3e série à 35 kg (12:34:31) et ses 3 min 36 de repos, avant le rowing (12:43:07). */
const TRACTION_28_AT = "2026-10-04T12:38:07.777Z";

function exerciseBlock(workout: WorkoutSession, id: string): PerformedExerciseBlock | undefined {
  const block = workout.blocks.find((item) => item.id === id);
  return block?.kind === "exercise" ? block : undefined;
}

function matchesObservedState(workout: WorkoutSession): boolean {
  if (workout.status !== "completed") return false;
  const traction = exerciseBlock(workout, TRACTION_BLOCK_ID);
  const curl = exerciseBlock(workout, CURL_BLOCK_ID);
  return (
    traction?.series?.length === 3 &&
    traction.series.every((set) => set.load?.kind === "total" && set.load.kg === 35 && set.reps === 5) &&
    traction.series.at(-1)?.completedAt === TRACTION_LAST_SET_AT &&
    curl?.exerciseId === "import-curl-biceps-ez" &&
    curl.series?.length === 3 &&
    curl.series[0]?.completedAt === CURL_FIRST_SET_AT &&
    curl.series.every((set) => set.load?.kind === "empty")
  );
}

/** La séance corrigée, ou `undefined` si elle n'est pas dans l'état attendu. */
export function fixWorkout20261004(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  if (!matchesObservedState(workout)) return undefined;

  const blocks = workout.blocks.map((block) => {
    if (block.kind !== "exercise") return block;
    if (block.id === TRACTION_BLOCK_ID) {
      const added: PerformedSeries = {
        id: `${TRACTION_BLOCK_ID}-set-4`,
        position: 3,
        status: "completed",
        role: "travail",
        load: { kind: "total", kg: 28 },
        reps: 3,
        sideLimited: false,
        completedAt: TRACTION_28_AT,
        restComparable: false,
      };
      return { ...block, series: [...block.series!, added] };
    }
    if (block.id === CURL_BLOCK_ID) {
      const curl: PerformedExerciseBlock = {
        ...block,
        exerciseId: "curl-halteres",
        note: "Curl haltères, bras alternés (corrigé le 04/10 : noté par erreur en curl barre EZ).",
        series: block.series!.map((set) => ({ ...set, load: { kind: "total", kg: 6 }, reps: 8, rpe: 8 })),
      };
      delete curl.frameVersionId;
      return curl;
    }
    return block;
  });

  return { ...workout, blocks, updatedAt: now };
}

/**
 * Pour les tests sur sauvegarde réelle : la version du cadre du curl EZ
 * attendue après le seed 31 — défigée si la séance du fichier était dans
 * l'état constaté et était sa seule séance officielle ; sinon inchangée.
 */
export function expectedCurlEzVersionAfterFix<V extends { id: string; firstOfficialWorkoutId?: string; frozenAt?: string; updatedAt: string }>(
  version: V,
  workouts: ReadonlyArray<WorkoutSession>,
  updatedAt: string,
): V {
  const target = workouts.find((workout) => workout.id === FIX_WORKOUT_ID);
  const others = workouts.some((workout) => workout.id !== FIX_WORKOUT_ID && workout.blocks.some((block) => block.kind === "exercise" && block.frameVersionId === CURL_EZ_VERSION_ID));
  if (version.id !== CURL_EZ_VERSION_ID || !target || !fixWorkout20261004(target, updatedAt) || version.firstOfficialWorkoutId !== FIX_WORKOUT_ID || others) return version;
  const unfrozen = { ...version, updatedAt };
  delete unfrozen.firstOfficialWorkoutId;
  delete unfrozen.frozenAt;
  return unfrozen;
}

export async function seedFixWorkout20261004(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.workouts, db.strengthMilestones, db.strengthFrameVersions, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.fixWorkout20261004 !== undefined) return;

    const workout = await db.workouts.get(FIX_WORKOUT_ID);
    const fixed = workout ? fixWorkout20261004(workout, now) : undefined;
    if (fixed) {
      await db.workouts.put(fixed);
      await db.strengthMilestones.delete(CURL_EZ_MILESTONE_ID);
      /* Le curl EZ n'a plus de séance officielle sous cette version : elle se défige. */
      const version = await db.strengthFrameVersions.get(CURL_EZ_VERSION_ID);
      const others = await db.workouts.filter((item) => item.id !== FIX_WORKOUT_ID && item.blocks.some((block) => block.kind === "exercise" && block.frameVersionId === CURL_EZ_VERSION_ID)).count();
      if (version?.firstOfficialWorkoutId === FIX_WORKOUT_ID && others === 0) {
        const unfrozen = { ...version, updatedAt: now };
        delete unfrozen.firstOfficialWorkoutId;
        delete unfrozen.frozenAt;
        await db.strengthFrameVersions.put(unfrozen);
      }
    }

    await db.settings.put({ key: "install", value: { ...install, fixWorkout20261004: now } });
  });
}
