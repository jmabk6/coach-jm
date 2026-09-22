import { db } from "../../db/database";
import type { Id, StrengthFrameVersion } from "../../domain";

/**
 * Les cadres tels que le moteur de séance les consomme (conception v1.6,
 * § 4.3) : la version **active** par exercice, à capturer au démarrage,
 * à l'ajout et à la substitution. Le moteur reste pur : c'est l'appelant
 * qui charge cette carte et la lui passe.
 */
export interface ActiveFrameVersions {
  /** exerciseId → identifiant de la version active. */
  versionIdByExercise: Map<Id, Id>;
  /** Toutes les versions connues, actives ou archivées, par identifiant. */
  versionById: Map<Id, StrengthFrameVersion>;
}

export async function loadActiveFrameVersions(): Promise<ActiveFrameVersions> {
  const [frames, versions] = await Promise.all([
    db.strengthFrames.toArray(),
    db.strengthFrameVersions.toArray(),
  ]);
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const versionIdByExercise = new Map<Id, Id>();

  for (const frame of frames) {
    const active = versionById.get(frame.activeVersionId);

    if (active && active.status === "active") {
      versionIdByExercise.set(frame.exerciseId, active.id);
    }
  }

  return { versionIdByExercise, versionById };
}
