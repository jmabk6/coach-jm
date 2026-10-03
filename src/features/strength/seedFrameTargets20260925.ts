import { db } from "../../db/database";
import type { InstallMarkers, StrengthFrame, StrengthFrameVersion } from "../../domain";
import { programFrameIds } from "./seedProgramFrames";

/**
 * Seed 15 (décision du 26/09/2026) : les premières cibles de trois cadres
 * de Muscu B, recalées d'après la séance du 25/09. Chaque cadre concerné
 * reçoit une **nouvelle version** : la V1 est archivée (motif
 * « erreur de calibration », son objectif tombe, événement 9) et la V2
 * reprend ses paramètres à l'identique, avec la nouvelle cible confirmée
 * (événement 1). Rien d'autre ne bouge.
 *
 * Un cadre n'est touché que s'il est encore dans l'état semé : V1 active
 * avec la cible d'origine. Un cadre déjà modifié par l'utilisateur (autre
 * version, hausse acceptée, cible changée) est laissé tel quel.
 */

export const FRAME_TARGETS_20260925: ReadonlyArray<{ exerciseId: string; seededTarget: number | undefined; target: number }> = [
  { exerciseId: "developpe-epaules-machine", seededTarget: 27.5, target: 20 },
  { exerciseId: "extension-triceps-poulie", seededTarget: 15, target: 12.5 },
  { exerciseId: "developpe-incline-halteres", seededTarget: undefined, target: 8 },
];

/**
 * Seed 22 (décision du 03/10/2026) : la traction assistée de Muscu A,
 * faite le 02/10 à 42 kg d'aide (8 / 8 / 6, RPE 8 / 9 / 10), garde 52 kg
 * comme première cible. Même recalage : nouvelle version, cible 42 kg,
 * paramètres identiques (3 × 6-8, RPE ≤ 8). Seulement si le cadre est
 * encore en V1 avec la cible de 52 kg semée.
 */
export const FRAME_TARGETS_20261003: ReadonlyArray<{ exerciseId: string; seededTarget: number | undefined; target: number }> = [
  { exerciseId: "traction-assistee", seededTarget: 52, target: 42 },
];

/**
 * La V1 archivée (motif « erreur de calibration », sans objectif) et la V2
 * aux mêmes paramètres, avec la nouvelle cible. Pure : les tests sur
 * sauvegarde réelle en tirent l'état attendu.
 */
export function recalibrate(
  frame: StrengthFrame,
  current: StrengthFrameVersion,
  target: number,
  now: string,
): { frame: StrengthFrame; archived: StrengthFrameVersion; next: StrengthFrameVersion } {
  const archived: StrengthFrameVersion = {
    ...current,
    status: "archived",
    archivedAt: now,
    archiveReason: "erreur_calibration",
    updatedAt: now,
  };
  delete archived.currentTarget;

  const next: StrengthFrameVersion = {
    ...current,
    id: `${frame.id}-v${current.number + 1}`,
    number: current.number + 1,
    status: "active",
    currentTarget: { value: target, unit: "kg", acceptedAt: now },
    createdAt: now,
    updatedAt: now,
  };
  /* Une version neuve n'est ni figée ni rattachée à une séance. */
  delete next.firstOfficialWorkoutId;
  delete next.frozenAt;

  return { frame: { ...frame, activeVersionId: next.id, updatedAt: now }, archived, next };
}

/** Recale les cadres d'une liste encore dans leur état semé (V1 active, cible d'origine). */
async function recalibrateSeeded(specs: typeof FRAME_TARGETS_20260925, now: string): Promise<void> {
  for (const spec of specs) {
    const { frameId, versionId } = programFrameIds(spec.exerciseId);
    const frame = await db.strengthFrames.get(frameId);
    const current = await db.strengthFrameVersions.get(versionId);

    if (!frame || !current || frame.activeVersionId !== versionId || current.status !== "active") continue;
    if (current.currentTarget?.value !== spec.seededTarget) continue;
    if (current.currentTarget?.fromMilestoneId !== undefined) continue;

    const { frame: moved, archived, next } = recalibrate(frame, current, spec.target, now);

    await db.strengthFrameVersions.put(archived);
    await db.strengthFrameVersions.add(next);
    await db.strengthFrames.put(moved);
  }
}

export async function seedFrameTargets20260925(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.strengthFrames, db.strengthFrameVersions, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.frameTargets20260925 !== undefined) return;
    await recalibrateSeeded(FRAME_TARGETS_20260925, now);
    await db.settings.put({ key: "install", value: { ...install, frameTargets20260925: now } });
  });
}

export async function seedTractionTarget20261003(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.strengthFrames, db.strengthFrameVersions, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionTarget20261003 !== undefined) return;
    await recalibrateSeeded(FRAME_TARGETS_20261003, now);
    await db.settings.put({ key: "install", value: { ...install, tractionTarget20261003: now } });
  });
}

/**
 * Pour les tests sur sauvegarde réelle : l'état attendu, après le seed 15,
 * des cadres et versions d'un fichier. `seededV2` donne la V2 trouvée en
 * base après les seeds (son `createdAt` date le recalage) ; sans V2, rien
 * n'a été recalé et l'enregistrement du fichier est attendu tel quel.
 */
export function expectedAfterFrameTargets(
  frames: ReadonlyArray<StrengthFrame>,
  versions: ReadonlyArray<StrengthFrameVersion>,
  seededV2: (frameId: string) => StrengthFrameVersion | undefined,
  /** Seed 23 (traction : RPE 9, cran de 7 kg) : une V3 trouvée en base devient la version active attendue. */
  seededV3: (frameId: string) => StrengthFrameVersion | undefined = () => undefined,
): Map<string, StrengthFrame | StrengthFrameVersion> {
  const expected = new Map<string, StrengthFrame | StrengthFrameVersion>();

  /* Seeds 15 et 22 : mêmes recalages, V1 → V2. */
  for (const spec of [...FRAME_TARGETS_20260925, ...FRAME_TARGETS_20261003]) {
    const { frameId, versionId } = programFrameIds(spec.exerciseId);
    const frame = frames.find((item) => item.id === frameId);
    const current = versions.find((item) => item.id === versionId);
    const v2 = seededV2(frameId);
    if (!frame || !current || !v2 || versions.some((item) => item.id === v2.id)) continue;

    const result = recalibrate(frame, current, spec.target, v2.createdAt);
    const v3 = seededV3(frameId);
    expected.set(frame.id, v3 ? { ...result.frame, activeVersionId: v3.id, updatedAt: v3.createdAt } : result.frame);
    expected.set(current.id, result.archived);
  }

  return expected;
}

/**
 * Seed 23 (03/10/2026), pari traction :
 * - la machine ne règle l'aide que par paliers de 7 kg : cran de 7 kg ;
 * - un palier se valide à RPE 9 au plus (et non plus 8), comme la règle
 *   du pari.
 * Changer le RPE cible crée une **nouvelle version** du cadre (motif
 * « changement de programme »), cible et autres paramètres conservés.
 * Si le RPE est déjà à 9, seul le cran est saisi, en place (N4).
 */
export async function seedTractionIncrement20261003(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.strengthFrames, db.strengthFrameVersions, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionIncrement20261003 !== undefined) return;

    const frame = await db.strengthFrames.where("exerciseId").equals("traction-assistee").first();
    const active = frame ? await db.strengthFrameVersions.get(frame.activeVersionId) : undefined;
    if (frame && active && active.status === "active") {
      const increment = active.increment ?? { unit: "kg" as const, value: 7 };
      if (active.rpeTarget !== 9) {
        const archived: StrengthFrameVersion = { ...active, status: "archived", archivedAt: now, archiveReason: "changement_programme", updatedAt: now };
        delete archived.currentTarget;
        const next: StrengthFrameVersion = {
          ...active,
          id: `${frame.id}-v${active.number + 1}`,
          number: active.number + 1,
          rpeTarget: 9,
          increment,
          createdAt: now,
          updatedAt: now,
        };
        delete next.firstOfficialWorkoutId;
        delete next.frozenAt;
        await db.strengthFrameVersions.put(archived);
        await db.strengthFrameVersions.add(next);
        await db.strengthFrames.put({ ...frame, activeVersionId: next.id, updatedAt: now });
      } else if (active.increment === undefined) {
        await db.strengthFrameVersions.put({ ...active, increment, updatedAt: now });
      }
    }

    await db.settings.put({ key: "install", value: { ...install, tractionIncrement20261003: now } });
  });
}
