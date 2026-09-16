import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { SessionTemplate } from "../../domain";
import { db } from "../../db/database";
import {
  getPlannedSessionsBetween,
  getWeeklyProgram,
  removePlannedSession,
  saveWeeklyProgram,
} from "../../db/repositories/programRepository";
import {
  archiveSessionTemplate,
  saveSessionTemplate,
} from "../../db/repositories/sessionTemplateRepository";
import {
  createEmptyWeeklyProgram,
  setWeeklyProgramDay,
} from "../../domain/rules/programRules";
import { applyWeeklyProgram } from "./applyWeeklyProgram";
import { generateProgramWeek } from "./generateProgramWeek";
import {
  addPlannedSession,
  duplicatePlannedSession,
  movePlannedSession,
  replacePlannedSession,
  restorePlannedSession,
  skipPlannedSession,
} from "./plannedSessionActions";

/**
 * Critère de fin de l'Étape 4 : une règle hebdomadaire, des semaines
 * générées à la navigation, des instances manipulées une à une, puis
 * la règle modifiée — les instances touchées gardent leurs décisions,
 * les intactes suivent la règle, le passé et la semaine en cours ne
 * bougent jamais. Base fermée puis rouverte : tout est relu à l'identique.
 */
describe("critère de fin — le Programme de bout en bout", () => {
  /* Mercredi 16 septembre 2026 : la semaine en cours va du 14 au 20. */
  const now = "2026-09-16T10:00:00.000Z";

  function template(id: string, name: string, position: number): SessionTemplate {
    return {
      id,
      name,
      category: id === "cardio" ? "Cardio" : "Musculation",
      status: "active",
      position,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async function listDates(start: string, end: string) {
    const sessions = await getPlannedSessionsBetween(start, end);

    return sessions.map((session) => [
      session.date,
      session.sessionTemplateId,
      session.status,
    ]);
  }

  beforeEach(async () => {
    await db.delete();
    await db.open();

    await saveSessionTemplate(template("muscu-a", "Muscu A", 0));
    await saveSessionTemplate(template("cardio", "Cardio", 1));
    await saveSessionTemplate(template("mobilite", "Mobilité", 2));

    let program = createEmptyWeeklyProgram(now);
    program = setWeeklyProgramDay(program, "thursday", "muscu-a", now);
    program = setWeeklyProgramDay(program, "friday", "cardio", now);
    await saveWeeklyProgram(program);
  });

  afterAll(async () => {
    await db.delete();
    db.close();
  });

  it("génère, laisse l'utilisateur décider instance par instance, puis suit la règle", async () => {
    /* La semaine en cours ne reçoit rien de la règle ; la suivante, oui. */
    expect(await generateProgramWeek("2026-09-14", now)).toEqual([]);
    expect(
      (await generateProgramWeek("2026-09-21", now)).map((s) => s.date),
    ).toEqual(["2026-09-24", "2026-09-25"]);

    /* Ajout ponctuel sur la semaine en cours : l'instance seule. */
    await addPlannedSession("2026-09-18", "cardio", now);
    expect(await listDates("2026-09-14", "2026-09-20")).toEqual([
      ["2026-09-18", "cardio", "upcoming"],
    ]);

    /* Déplacer le Cardio du 25 au 23 : le 25 n'est jamais recréé. */
    await movePlannedSession("weekly-2026-09-25", "2026-09-23");
    expect(await generateProgramWeek("2026-09-21", now)).toEqual([]);
    expect(await listDates("2026-09-21", "2026-09-27")).toEqual([
      ["2026-09-23", "cardio", "upcoming"],
      ["2026-09-24", "muscu-a", "upcoming"],
    ]);

    /* Retirer du 24 : tombstone, jamais recréé non plus. */
    await removePlannedSession("weekly-2026-09-24");
    expect(await generateProgramWeek("2026-09-21", now)).toEqual([]);
    expect(await listDates("2026-09-21", "2026-09-27")).toEqual([
      ["2026-09-23", "cardio", "upcoming"],
    ]);

    /* Semaine du 28 : générée intacte, puis le jeudi remplacé à la main. */
    await generateProgramWeek("2026-09-28", now);
    await replacePlannedSession("weekly-2026-10-01", "mobilite");
    await generateProgramWeek("2026-10-05", now);

    /* Modification de la règle : jeudi → Mobilité, vendredi → aucune. */
    const current = await getWeeklyProgram();
    if (!current) throw new Error("règle absente");
    let next = setWeeklyProgramDay(current, "thursday", "mobilite", now);
    next = setWeeklyProgramDay(next, "friday", undefined, now);
    await applyWeeklyProgram(next, now);

    /* Semaine en cours et instances touchées : inchangées. */
    expect(await listDates("2026-09-14", "2026-09-20")).toEqual([
      ["2026-09-18", "cardio", "upcoming"],
    ]);
    expect(await listDates("2026-09-21", "2026-09-27")).toEqual([
      ["2026-09-23", "cardio", "upcoming"],
    ]);
    /* Le jeudi 1er remplacé à la main reste Mobilité ; le vendredi 2, intact, disparaît. */
    expect(await listDates("2026-09-28", "2026-10-04")).toEqual([
      ["2026-10-01", "mobilite", "upcoming"],
    ]);
    /* Semaine du 5 : intacte, elle suit la règle. */
    expect(await listDates("2026-10-05", "2026-10-11")).toEqual([
      ["2026-10-08", "mobilite", "upcoming"],
    ]);

    /* Une journée nouvellement affectée apparaît dans toutes les semaines déjà visitées. */
    const withMonday = setWeeklyProgramDay(next, "monday", "muscu-a", now);
    await applyWeeklyProgram(withMonday, now);
    expect(await listDates("2026-10-05", "2026-10-11")).toEqual([
      ["2026-10-05", "muscu-a", "upcoming"],
      ["2026-10-08", "mobilite", "upcoming"],
    ]);

    /* Statuts : sautée, remise à venir, dupliquée. */
    await skipPlannedSession("weekly-2026-10-05");
    expect(await listDates("2026-10-05", "2026-10-05")).toEqual([
      ["2026-10-05", "muscu-a", "skipped"],
    ]);
    await restorePlannedSession("weekly-2026-10-05");
    await duplicatePlannedSession("weekly-2026-10-05", "2026-10-06", now);
    expect(await listDates("2026-10-05", "2026-10-06")).toEqual([
      ["2026-10-05", "muscu-a", "upcoming"],
      ["2026-10-06", "muscu-a", "upcoming"],
    ]);

    /* Archiver Mobilité la retire de la règle ; ses instances restent. */
    await archiveSessionTemplate("mobilite");
    const afterArchive = await getWeeklyProgram();
    expect(afterArchive?.days.map((day) => day.sessionTemplateId)).toEqual([
      "muscu-a",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(await listDates("2026-10-08", "2026-10-08")).toEqual([
      ["2026-10-08", "mobilite", "upcoming"],
    ]);

    /* Fermer, rouvrir : tout est relu à l'identique. */
    db.close();
    await db.open();

    expect(await listDates("2026-09-14", "2026-10-11")).toEqual([
      ["2026-09-18", "cardio", "upcoming"],
      ["2026-09-21", "muscu-a", "upcoming"],
      ["2026-09-23", "cardio", "upcoming"],
      ["2026-09-28", "muscu-a", "upcoming"],
      ["2026-10-01", "mobilite", "upcoming"],
      ["2026-10-05", "muscu-a", "upcoming"],
      ["2026-10-06", "muscu-a", "upcoming"],
      ["2026-10-08", "mobilite", "upcoming"],
    ]);
  });
});
