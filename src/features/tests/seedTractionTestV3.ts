import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, PlannedTest, TestMeasureSpec, TestProtocolVersion, TestScheduleEntry } from "../../domain";
import { PROGRAM_V2_TEST_SCHEDULE } from "../program/programV2";

/**
 * Seed 27 (05/10/2026), test traction V3 du pari V6 :
 * - le test **remplace** la traction de la Muscu A du dimanche de test :
 *   plus aucune série de travail après le test officiel (fini les 2
 *   séries de l'ancien jour de test) ;
 * - il part du **palier A réel** (moteur V6), puis 7 kg d'aide en moins
 *   après chaque essai réussi, 3 min de repos, jusqu'au premier échec ;
 *   on peut descendre jusqu'à 0 kg ;
 * - résultat : la plus petite assistance réussie ; enregistrés avec lui
 *   le palier de départ, chaque essai, le poids du jour et la charge
 *   effective indicative. Le test ne change jamais le palier A ; une
 *   traction réussie à 0 kg = objectif gagné.
 *
 * Nouvelle version du protocole (la précédente est archivée, jamais
 * réécrite) ; le calendrier des tests et les séances à venir déjà
 * générées passent au remplacement de la brique.
 */

export const TRACTION_TEST_V3_INSTRUCTIONS = [
  "Le test remplace la traction de la Muscu A : aucune série de travail après le test.",
  "Échauffement : 2 séries faciles, nettement plus assistées que le palier A, non enregistrées.",
  "Premier essai : 1 traction stricte au palier A réel (indiqué au-dessus des essais).",
  "Essai réussi : 7 kg d'aide en moins, 3 min de repos, nouvel essai.",
  "Arrêt au premier échec. On peut descendre jusqu'à 0 kg.",
  "Essai réussi = bras tendus au départ, menton au-dessus de la barre, sans élan.",
  "Résultat : la plus petite assistance réussie. Le test ne change jamais le palier A ; une traction stricte réussie à 0 kg = objectif gagné.",
  "Toujours la même machine.",
  "Après le test : les autres exercices de Muscu A, en travail propre, sans recherche de record ni échec.",
];

export const TRACTION_TEST_V3_SETTINGS = { warmupSets: 2, stepMinKg: 7, stepMaxKg: 7, restSec: 180, start: "palier_a" };

export const TRACTION_TEST_V3_MEASURES: TestMeasureSpec[] = [
  { key: "assistance_min_kg", label: "Meilleure assistance réussie", unit: "kg", input: "derived", required: true, exerciseId: "traction-assistee" },
  { key: "palier_a_depart_kg", label: "Palier A au départ", unit: "kg", input: "derived", required: true },
  { key: "essais_nb", label: "Nombre d'essais", unit: "essais", input: "derived", required: false },
  { key: "poids_jour_kg", label: "Poids du jour", unit: "kg", input: "entered", required: false },
  { key: "charge_effective_kg", label: "Charge effective indicative", unit: "kg", input: "derived", required: false },
];

const TRACTION_SCHEDULE = PROGRAM_V2_TEST_SCHEDULE.find((entry) => entry.protocolKey === "traction")!;

/** Le test traction d'une séance planifiée, au remplacement de la brique ; `undefined` s'il y est déjà. */
function retargeted(test: PlannedTest): PlannedTest | undefined {
  if (test.protocolId !== "protocol-traction" || !test.adjustments?.some((item) => item.blockId === "v2-muscu-a-traction")) return undefined;
  const next: PlannedTest = { ...test, placement: "replace_block", targetBlockId: "v2-muscu-a-traction" };
  delete next.adjustments;
  return next;
}

export async function seedTractionTestV320261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.testProtocols, db.testProtocolVersions, db.settings, db.plannedSessions], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionTestV320261005 !== undefined) return;

    /* 1. Protocole : nouvelle version, la précédente archivée. */
    const protocol = await db.testProtocols.get("protocol-traction");
    const active = protocol ? await db.testProtocolVersions.get(protocol.activeVersionId) : undefined;
    if (protocol && active && active.kind === "trials_descending" && active.settings?.start !== "palier_a") {
      const versions = await db.testProtocolVersions.where("protocolId").equals(protocol.id).toArray();
      const number = Math.max(...versions.map((version) => version.number)) + 1;
      const next: TestProtocolVersion = {
        ...structuredClone(active),
        id: `${protocol.id}-v${number}`,
        number,
        status: "active",
        instructions: [...TRACTION_TEST_V3_INSTRUCTIONS],
        settings: { ...TRACTION_TEST_V3_SETTINGS },
        measures: structuredClone(TRACTION_TEST_V3_MEASURES),
        primaryMeasureKey: "assistance_min_kg",
        createdAt: now,
        updatedAt: now,
      };
      delete next.firstOfficialResultId;
      delete next.frozenAt;
      await db.testProtocolVersions.put({ ...active, status: "archived", updatedAt: now });
      await db.testProtocolVersions.add(next);
      await db.testProtocols.put({ ...protocol, activeVersionId: next.id, updatedAt: now });
    }

    /* 2. Calendrier des tests : la brique traction de Muscu A est remplacée. */
    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    if (schedule?.some((entry) => entry.protocolKey === "traction" && entry.templateId === "v2-muscu-a" && entry.adjustments !== undefined)) {
      await db.settings.put({
        key: "testSchedule",
        value: schedule.map((entry) => (entry.protocolKey === "traction" && entry.templateId === "v2-muscu-a" ? structuredClone(TRACTION_SCHEDULE) : entry)),
      });
    }

    /* 3. Séances à venir déjà générées. */
    const upcoming = await db.plannedSessions.where("status").equals("upcoming").toArray();
    for (const session of upcoming) {
      if (!session.tests?.some((test) => retargeted(test) !== undefined)) continue;
      const next: PlannedSession = { ...session, tests: session.tests.map((test) => retargeted(test) ?? test), updatedAt: now };
      await db.plannedSessions.put(next);
    }

    await db.settings.put({ key: "install", value: { ...install, tractionTestV320261005: now } });
  });
}
