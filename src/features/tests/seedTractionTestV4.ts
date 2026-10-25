import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, PlannedTest, TestProtocolVersion, TestScheduleEntry } from "../../domain";

/**
 * Seed 47 (25/10/2026), test traction V4 du pari V6 (décision de
 * l'utilisateur après le test #1 du 25/10) :
 * - le test reste le même (départ au palier A réel, −7 kg après chaque
 *   essai réussi, arrêt au premier échec) et se place juste après
 *   l'échauffement ;
 * - la traction de la Muscu A ne disparaît plus : **2 séries de
 *   complément**, après 3 min de repos, à **palier A + 7 kg d'aide**,
 *   jusqu'à 5 répétitions, RPE 8 au plus ;
 * - ces séries sont une prescription réduite (2 séries au lieu de 3) :
 *   elles ne valident ni ne font reculer le palier A, ne comptent ni en
 *   régression ni en stagnation.
 *
 * Nouvelle version du protocole (la V3, figée par le test du 25/10, est
 * archivée, jamais réécrite) ; le calendrier des tests et les séances à
 * venir déjà générées passent au nouveau placement.
 */

export const TRACTION_TEST_V4_INSTRUCTIONS = [
  "Le test se fait juste après l'échauffement ; la traction de la Muscu A suit, en 2 séries de complément.",
  "Échauffement : 2 séries faciles, nettement plus assistées que le palier A, non enregistrées.",
  "Premier essai : 1 traction stricte au palier A réel (indiqué au-dessus des essais).",
  "Essai réussi : 7 kg d'aide en moins, 3 min de repos, nouvel essai.",
  "Arrêt au premier échec. On peut descendre jusqu'à 0 kg.",
  "Essai réussi = bras tendus au départ, menton au-dessus de la barre, sans élan.",
  "Résultat : la plus petite assistance réussie. Le test ne change jamais le palier A ; une traction stricte réussie à 0 kg = objectif gagné.",
  "Toujours la même machine.",
  "Après le test : 3 min de repos, puis 2 séries de complément à palier A + 7 kg d'aide, jusqu'à 5 répétitions, RPE 8 au plus. Elles ne valident ni ne font reculer le palier A.",
  "Ensuite : les autres exercices de Muscu A, en travail propre, sans recherche de record ni échec.",
];

/** Complément après le test : 2 séries, jusqu'à 5 répétitions, palier A + 7 kg d'aide, RPE 8 au plus. */
export const TRACTION_TEST_V4_COMPLEMENT = { sets: 2, reps: 5, offsetKg: 7, rpeMax: 8 } as const;

const TRACTION_BLOCK_ID = "v2-muscu-a-traction";

/** Le test traction de Muscu A au placement V4 : après l'échauffement, la traction réduite à 2 séries. */
export const TRACTION_TEST_V4_SCHEDULE: TestScheduleEntry = {
  protocolKey: "traction",
  weekday: "sunday",
  slot: "day",
  templateId: "v2-muscu-a",
  placement: "after_warmup",
  adjustments: [{ blockId: TRACTION_BLOCK_ID, sets: TRACTION_TEST_V4_COMPLEMENT.sets }],
};

/** Le test traction d'une séance planifiée, au placement V4 ; `undefined` s'il n'est pas au placement V3. */
export function tractionTestV4(test: PlannedTest): PlannedTest | undefined {
  if (test.protocolId !== "protocol-traction" || test.placement !== "replace_block" || test.targetBlockId !== TRACTION_BLOCK_ID) return undefined;
  const next: PlannedTest = { ...test, placement: "after_warmup", adjustments: [{ blockId: TRACTION_BLOCK_ID, sets: TRACTION_TEST_V4_COMPLEMENT.sets }] };
  delete next.targetBlockId;
  return next;
}

export async function seedTractionTestV420261025(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.testProtocols, db.testProtocolVersions, db.settings, db.plannedSessions], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionTestV420261025 !== undefined) return;

    /* 1. Protocole : nouvelle version depuis la V3 (départ au palier A), la V3 archivée. */
    const protocol = await db.testProtocols.get("protocol-traction");
    const active = protocol ? await db.testProtocolVersions.get(protocol.activeVersionId) : undefined;
    if (protocol && active && active.kind === "trials_descending" && active.settings?.start === "palier_a" && active.settings.complementSets === undefined) {
      const versions = await db.testProtocolVersions.where("protocolId").equals(protocol.id).toArray();
      const number = Math.max(...versions.map((version) => version.number)) + 1;
      const next: TestProtocolVersion = {
        ...structuredClone(active),
        id: `${protocol.id}-v${number}`,
        number,
        status: "active",
        instructions: [...TRACTION_TEST_V4_INSTRUCTIONS],
        settings: {
          ...active.settings,
          complementSets: TRACTION_TEST_V4_COMPLEMENT.sets,
          complementReps: TRACTION_TEST_V4_COMPLEMENT.reps,
          complementOffsetKg: TRACTION_TEST_V4_COMPLEMENT.offsetKg,
          complementRpeMax: TRACTION_TEST_V4_COMPLEMENT.rpeMax,
        },
        createdAt: now,
        updatedAt: now,
      };
      delete next.firstOfficialResultId;
      delete next.frozenAt;
      await db.testProtocolVersions.put({ ...active, status: "archived", updatedAt: now });
      await db.testProtocolVersions.add(next);
      await db.testProtocols.put({ ...protocol, activeVersionId: next.id, updatedAt: now });
    }

    /* 2. Calendrier des tests : la traction de Muscu A n'est plus remplacée, mais réduite à 2 séries. */
    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    const isV3 = (entry: TestScheduleEntry) => entry.protocolKey === "traction" && entry.templateId === "v2-muscu-a" && entry.placement === "replace_block" && entry.targetBlockId === TRACTION_BLOCK_ID;
    if (schedule?.some(isV3)) {
      await db.settings.put({ key: "testSchedule", value: schedule.map((entry) => (isV3(entry) ? asV4(entry) : entry)) });
    }

    /* 3. Séances à venir déjà générées. */
    const upcoming = await db.plannedSessions.where("status").equals("upcoming").toArray();
    for (const session of upcoming) {
      if (!session.tests?.some((test) => tractionTestV4(test) !== undefined)) continue;
      const next: PlannedSession = { ...session, tests: session.tests.map((test) => tractionTestV4(test) ?? test), updatedAt: now };
      await db.plannedSessions.put(next);
    }

    await db.settings.put({ key: "install", value: { ...install, tractionTestV420261025: now } });
  });
}

/** L'entrée du calendrier au placement V4 (ses autres réglages gardés, la brique visée retirée). */
function asV4(entry: TestScheduleEntry): TestScheduleEntry {
  const next: TestScheduleEntry = { ...entry, ...structuredClone(TRACTION_TEST_V4_SCHEDULE) };
  delete next.targetBlockId;
  return next;
}
