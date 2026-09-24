import { db } from "../../db/database";
import { WEEKLY_PROGRAM_ID } from "../../db/repositories/programRepository";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { PROGRAM_V1_ROUTINES, PROGRAM_V1_TEMPLATES, PROGRAM_V1_TEST_SCHEDULE, PROGRAM_V1_WEEKLY } from "./programV1";

/**
 * Seeds 5 et 6 (SCHEMA_DEXIE_V3_MIGRATION.md § 5.2). Chacun est une
 * transaction qui écrit ses données **et** son marqueur `install.*` ; un
 * marqueur posé ne se rejoue plus, même si l'utilisateur a depuis archivé
 * ou modifié ce qui avait été installé.
 */

async function readInstall(): Promise<InstallMarkers | undefined> {
  return (await db.settings.get("install"))?.value as InstallMarkers | undefined;
}

async function markInstalled(marker: keyof InstallMarkers, now: string): Promise<void> {
  const install = await readInstall();
  await db.settings.put({ key: "install", value: { ...install, [marker]: now } });
}

/** Ajoute les modèles absents, à la suite des modèles existants ; un id fixe présent est conservé tel quel. */
async function addMissingTemplates(contents: typeof PROGRAM_V1_TEMPLATES, now: string): Promise<void> {
  const existing = await db.sessionTemplates.toArray();
  const present = new Set(existing.map((template) => template.id));
  let position = existing.reduce((max, template) => Math.max(max, template.position), -1);

  for (const content of contents) {
    if (present.has(content.id)) continue;

    position += 1;
    const template: SessionTemplate = {
      ...structuredClone(content),
      origin: "program_v1",
      status: "active",
      position,
      createdAt: now,
      updatedAt: now,
    };
    await db.sessionTemplates.add(template);
  }
}

/**
 * Seed 5 : les 6 modèles du programme V1 ; la règle hebdomadaire du
 * dimanche au samedi **si aucune n'existe** (une règle existante n'est
 * jamais écrasée ni fusionnée) ; la place des tests si elle manque. Le
 * brouillon de l'utilisateur n'est jamais touché : les ids `v1-*` sont
 * distincts.
 */
export async function seedProgramV1(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.weeklyPrograms, db.settings, async () => {
    if ((await readInstall())?.programV1 !== undefined) return;

    await addMissingTemplates(PROGRAM_V1_TEMPLATES, now);

    if ((await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID)) === undefined) {
      await db.weeklyPrograms.add({ ...structuredClone(PROGRAM_V1_WEEKLY), id: WEEKLY_PROGRAM_ID, createdAt: now, updatedAt: now });
    }

    if ((await db.settings.get("testSchedule")) === undefined) {
      await db.settings.add({ key: "testSchedule", value: structuredClone(PROGRAM_V1_TEST_SCHEDULE) });
    }

    await markInstalled("programV1", now);
  });
}

/** Seed 6 : les 3 routines du soir, vides (correction B). */
export async function seedRoutines(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, async () => {
    if ((await readInstall())?.routines !== undefined) return;

    await addMissingTemplates(PROGRAM_V1_ROUTINES, now);
    await markInstalled("routines", now);
  });
}
