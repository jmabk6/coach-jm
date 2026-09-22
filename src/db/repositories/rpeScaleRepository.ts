import { db } from "../database";
import type { Id, RpeScaleVersion } from "../../domain";

/**
 * Échelle de RPE versionnée (conception v1.6, § 4.5).
 */

export async function getRpeScaleVersion(id: Id): Promise<RpeScaleVersion | undefined> {
  return db.rpeScaleVersions.get(id);
}

/**
 * La version en vigueur : la plus récente des actives. Absente tant que
 * le seed n'a pas tourné — une séance démarrée alors n'a pas de
 * `rpeScaleVersionId`, comme les séances antérieures au lot 4.
 */
export async function getActiveRpeScaleVersion(): Promise<RpeScaleVersion | undefined> {
  const active = await db.rpeScaleVersions.where("status").equals("active").toArray();

  return active.sort((a, b) => b.number - a.number)[0];
}

/** Toutes les versions, de la première à la dernière. */
export async function getAllRpeScaleVersions(): Promise<RpeScaleVersion[]> {
  const versions = await db.rpeScaleVersions.toArray();

  return versions.sort((a, b) => a.number - b.number);
}

export async function saveRpeScaleVersion(version: RpeScaleVersion): Promise<void> {
  await db.rpeScaleVersions.put(version);
}
