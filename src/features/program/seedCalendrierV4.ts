import { db } from "../../db/database";
import type { Goal, Id, InstallMarkers, PlannedSession, SessionTemplate, TestScheduleEntry, WeeklyProgram } from "../../domain";
import { formatLocalDate, getSourceDate, getWeekdayOf, getWeekStartDate, slotOf } from "../../domain/rules/programRules";
import { generateProgramWeek } from "./generateProgramWeek";
import {
  ARCHIVED_TEMPLATES_V4,
  CALENDAR_V4_TEMPLATES,
  EVENING_BY_WEEKDAY_V4,
  OPEN_BOOK_EXERCISE_ID,
  openBookExercise,
  OPTIONAL_BY_WEEKDAY_V4,
  PADEL_EXERCISE_ID,
  padelExercise,
  PROGRAM_V4_DAYS,
  testScheduleV4,
} from "./programCalendarV4";
import { PROGRAM_V4_START } from "./programV4";

/**
 * Seed 51 (programme V4, lot L4) — le calendrier V4, **à partir du dimanche
 * d'activation seulement** : avant, il ne fait rien et sera retenté au
 * lancement suivant (aucun marqueur posé).
 *
 * - Modèles créés : vélo endurance, vélo côtes, padel, récupération douce
 *   (et les exercices padel et rotation thoracique allongée).
 * - Cardio B et Cardio C archivés (historique conservé) ; Cardio A reste
 *   pour le test cardio sur tapis des semaines de tests.
 * - Règle hebdomadaire V4 : un modèle par jour, une routine par soir
 *   (vendredi et samedi sans routine), samedi sans séance prévue, padel et
 *   récupération proposés le samedi.
 * - Calendrier des tests : le test cardio prend la place du vélo côtes.
 * - Séances déjà générées **à partir du dimanche d'activation** : celles
 *   que la règle a créées et que personne n'a touchées suivent la V4 (ou
 *   disparaissent : samedi, vendredi soir) ; une séance démarrée, faite,
 *   sautée, retirée, déplacée, ajoutée à la main ou qui porte un test ne
 *   bouge pas. **Rien avant l'activation ne change.**
 * - Objectif Cardio : le vélo devient un exercice lié (affichage).
 */

/** La règle hebdomadaire V4, à partir de la règle actuelle (identifiant et date de création gardés). */
export function weeklyProgramV4(program: WeeklyProgram, now: string): WeeklyProgram {
  const next: WeeklyProgram = {
    ...program,
    name: "Programme V4",
    days: structuredClone(PROGRAM_V4_DAYS),
    eveningByWeekday: { ...EVENING_BY_WEEKDAY_V4 },
    optionalByWeekday: structuredClone(OPTIONAL_BY_WEEKDAY_V4),
    updatedAt: now,
  };
  delete next.eveningRotation;
  delete next.eveningRotationAnchor;
  return next;
}

/** Une séance que la règle a créée et que personne n'a touchée. */
function untouched(session: PlannedSession): boolean {
  return (
    session.source === "weekly_program" &&
    session.status === "upcoming" &&
    !session.workoutId &&
    !session.removedAt &&
    (session.tests?.length ?? 0) === 0 &&
    getSourceDate(session) === session.date
  );
}

/**
 * Les séances déjà générées à partir de l'activation, remises sur la règle
 * V4 (fonction pure). Les séances d'avant l'activation et celles qui
 * appartiennent à l'utilisateur ne sont jamais touchées.
 */
export function plannedSessionsV4(sessions: ReadonlyArray<PlannedSession>, now: string): { deleteIds: Id[]; updates: PlannedSession[] } {
  const result: { deleteIds: Id[]; updates: PlannedSession[] } = { deleteIds: [], updates: [] };
  for (const session of sessions) {
    if (session.date < PROGRAM_V4_START || !untouched(session)) continue;
    const weekday = getWeekdayOf(session.date);
    const target = slotOf(session) === "evening" ? EVENING_BY_WEEKDAY_V4[weekday] : slotOf(session) === "day" ? PROGRAM_V4_DAYS.find((day) => day.weekday === weekday)?.sessionTemplateId : session.sessionTemplateId;
    if (!target) result.deleteIds.push(session.id);
    else if (target !== session.sessionTemplateId) result.updates.push({ ...session, sessionTemplateId: target, sourceWeekday: weekday, updatedAt: now });
  }
  return result;
}

/** L'objectif Cardio avec le vélo, juste après le tapis ; `undefined` s'il l'a déjà. */
export function cardioGoalWithVelo(goal: Goal, now: string): Goal | undefined {
  if (goal.linkedExercises.some((link) => link.exerciseId === "velo")) return undefined;
  return { ...goal, linkedExercises: [...goal.linkedExercises, { exerciseId: "velo" }], updatedAt: now };
}

export async function seedCalendrierV4(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_V4_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.exercises, db.weeklyPrograms, db.plannedSessions, db.goals, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.calendrierV4 !== undefined) return;

    if (!(await db.exercises.get(PADEL_EXERCISE_ID))) await db.exercises.add(padelExercise(now));
    if (!(await db.exercises.get(OPEN_BOOK_EXERCISE_ID))) await db.exercises.add(openBookExercise(now));

    const templates = (await db.sessionTemplates.toArray()) as SessionTemplate[];
    let position = Math.max(0, ...templates.map((template) => template.position)) + 1;
    for (const content of CALENDAR_V4_TEMPLATES) {
      if (templates.some((template) => template.id === content.id)) continue;
      await db.sessionTemplates.add({ ...structuredClone(content), status: "active", position, createdAt: now, updatedAt: now } as SessionTemplate);
      position += 1;
    }
    for (const id of ARCHIVED_TEMPLATES_V4) {
      const template = templates.find((item) => item.id === id);
      if (template && template.status !== "archived") await db.sessionTemplates.put({ ...template, status: "archived", updatedAt: now });
    }

    const program = (await db.weeklyPrograms.toArray())[0] as WeeklyProgram | undefined;
    if (program) await db.weeklyPrograms.put(weeklyProgramV4(program, now));

    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    if (schedule) await db.settings.put({ key: "testSchedule", value: testScheduleV4(schedule) });

    const sessions = (await db.plannedSessions.where("date").aboveOrEqual(PROGRAM_V4_START).toArray()) as PlannedSession[];
    const { deleteIds, updates } = plannedSessionsV4(sessions, now);
    if (deleteIds.length > 0) await db.plannedSessions.bulkDelete(deleteIds);
    if (updates.length > 0) await db.plannedSessions.bulkPut(updates);

    const cardio = (await db.goals.where("key").equals("cardio").first()) as Goal | undefined;
    const goal = cardio ? cardioGoalWithVelo(cardio, now) : undefined;
    if (goal) await db.goals.put(goal);

    await db.settings.put({ key: "install", value: { ...install, calendrierV4: now } });
  });

  /* La semaine d'activation, si elle n'avait pas encore été générée : complétée à partir d'aujourd'hui
     (jamais de séance « manquée » dans le passé) ; une séance déjà là n'est jamais recréée. */
  if (getWeekStartDate(today) === getWeekStartDate(PROGRAM_V4_START)) await generateProgramWeek(getWeekStartDate(today), now, today);
}
