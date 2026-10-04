import { db } from "../../db/database";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { CURL_BICEPS_ID, CURL_HALTERES_NOTE } from "./programV2";

/**
 * Seed 32 (04/10/2026) : dans Muscu A, le curl haltères (bras alternés)
 * remplace le curl à la barre EZ — même place, même consigne 3 × 8-12,
 * 1 min 30 de repos. Seulement si la brique est encore le curl EZ. Les
 * séances faites ne bougent pas ; une Muscu A planifiée prend le modèle à
 * son démarrage.
 */

/** Muscu A avec le curl haltères, ou `undefined` si la brique n'est plus le curl EZ. */
export function muscuAWithCurlHalteres(template: SessionTemplate, now: string): SessionTemplate | undefined {
  const curl = template.blocks.find((block) => block.id === "v2-muscu-a-curl");
  if (curl?.kind !== "exercise" || curl.exerciseId !== "import-curl-biceps-ez") return undefined;
  return {
    ...template,
    blocks: template.blocks.map((block) =>
      block.id === curl.id && block.kind === "exercise" ? { ...block, exerciseId: CURL_BICEPS_ID, notes: CURL_HALTERES_NOTE } : block,
    ),
    updatedAt: now,
  };
}

export async function seedCurlHalteresMuscuA20261004(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.curlHalteresMuscuA20261004 !== undefined) return;

    const a = await db.sessionTemplates.get("v2-muscu-a");
    const next = a ? muscuAWithCurlHalteres(a, now) : undefined;
    if (next) await db.sessionTemplates.put(next);

    await db.settings.put({ key: "install", value: { ...install, curlHalteresMuscuA20261004: now } });
  });
}
