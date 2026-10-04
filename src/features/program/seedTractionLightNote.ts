import { db } from "../../db/database";
import type { InstallMarkers } from "../../domain";
import { TRACTION_LIGHT_NOTE, TRACTION_LIGHT_NOTE_A_PLUS_7 } from "./programV2";

/**
 * Seed 34 (05/10/2026), pari V6 : Muscu B ne suit plus « A + 7 kg » — son
 * aide est le palier de volume du dernier palier A validé (moteur V6,
 * `bKg`). La consigne de la traction de Muscu B est mise à jour, seulement
 * si elle est encore la consigne semée « A + 7 kg ». Les séances faites
 * gardent leur copie.
 */
export async function seedTractionLightNote20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionLightNote20261005 !== undefined) return;

    const b = await db.sessionTemplates.get("v2-muscu-b");
    if (b?.blocks.some((block) => block.id === "v2-muscu-b-traction" && block.kind === "exercise" && block.notes === TRACTION_LIGHT_NOTE_A_PLUS_7)) {
      await db.sessionTemplates.put({
        ...b,
        blocks: b.blocks.map((block) => (block.id === "v2-muscu-b-traction" && block.kind === "exercise" ? { ...block, notes: TRACTION_LIGHT_NOTE } : block)),
        updatedAt: now,
      });
    }

    await db.settings.put({ key: "install", value: { ...install, tractionLightNote20261005: now } });
  });
}
