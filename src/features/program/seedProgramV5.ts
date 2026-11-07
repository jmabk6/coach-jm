import { db } from "../../db/database";
import type {
  Exercise,
  Id,
  InstallMarkers,
  PlannedSession,
  ProgressionTrack,
  SessionBlock,
  SessionTemplate,
  StrengthFrameVersion,
  TestScheduleEntry,
  WeeklyProgram,
  WorkoutSession,
  Weekday,
} from "../../domain";
import { formatLocalDate, getSourceDate, getWeekdayOf, getWeekStartDate, slotOf } from "../../domain/rules/programRules";
import { withDetailedReferences } from "../perspectives/seedPerspectives20261022";
import { trackSpecsFrom } from "../perspectives/tracks";
import { generateProgramWeek } from "./generateProgramWeek";
import type { V4Template } from "./programV4";
import {
  ARCHIVED_TEMPLATES_V5,
  CARDIOS_V5_IDS,
  cardioTemplateV5,
  CLOSED_TRACKS_V5,
  ELEVATIONS_C_REFERENCE_V5,
  EVENING_BY_WEEKDAY_V5_COMPLETE,
  EVENING_BY_WEEKDAY_V5_START,
  FRAMES_V5,
  MOVED_TRACKS_V5,
  MUSCU_V5_TEMPLATES,
  PONT_FESSIER_ID,
  pontFessierExercise,
  PROGRAM_V5_DAYS,
  PROGRAM_V5_FIRST_DAY,
  PROGRAM_V5_START,
  RECALCULATED_TRACKS_V5,
  ROUTINE_DOS_COMPLETE_START,
  ROUTINES_V5_TEMPLATES,
  testScheduleV5,
} from "./programV5";
import { frameVersion20261005 } from "./seedProgramMuscu20261005";

/**
 * Programme V5 (décisions de JM du 07/11/2026) — seeds 55 à 58, **à partir
 * du dimanche d'activation seulement** (`PROGRAM_V5_START`) : avant, ils ne
 * font rien et sont retentés au lancement suivant (aucun marqueur posé).
 * Les séances faites et démarrées ne bougent jamais (elles ont leur copie du
 * modèle) ; rien n'est supprimé (modèles archivés, cadres versionnés, pistes
 * closes).
 */

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/* -------------------------------------------------------------------------- */
/* Seed 55 — Muscu A, B, C                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Les modèles A, B et C de la V5, ou `undefined` si l'un d'eux n'a plus
 * exactement ses briques V4 (les trois changent ensemble : le tirage et le
 * rowing léger passent de l'un à l'autre).
 */
export function muscuTemplatesV5(templates: ReadonlyArray<SessionTemplate>, now: string): SessionTemplate[] | undefined {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const current = MUSCU_V5_TEMPLATES.map((definition) => byId.get(definition.id));
  if (current.some((template, index) => !template || !sameIds(template.blocks.map((block) => block.id), MUSCU_V5_TEMPLATES[index]!.before))) return undefined;
  const existing = new Map(current.flatMap((template) => template!.blocks.map((block) => [block.id, block] as const)));
  return MUSCU_V5_TEMPLATES.map((definition, index) => withV5Blocks(current[index]!, definition, existing, now));
}

function withV5Blocks(template: SessionTemplate, definition: V4Template, existing: ReadonlyMap<string, SessionBlock>, now: string): SessionTemplate {
  const blocks = definition.blocks.map((item, position): SessionBlock => {
    if ("keep" in item) return { ...existing.get(item.keep)!, position };
    if ("set" in item) {
      const base = existing.get(item.set.id);
      const next = { ...(base ?? {}), ...structuredClone(item.set), position } as SessionBlock;
      if (base && base.kind === "exercise" && base.outsideFrame && !item.set.outsideFrame) delete (next as { outsideFrame?: true }).outsideFrame;
      return next;
    }
    return { ...structuredClone(item.add), position };
  });
  return { ...template, name: definition.name, subtitle: definition.subtitle, tags: [...definition.tags], description: definition.description, blocks, contentSince: PROGRAM_V5_START, updatedAt: now };
}

/** Les pistes après la V5 (fonction pure) : déplacées, closes, recalculées ; les élévations de C repartent d'une nouvelle référence. */
export function tracksV5(tracks: ReadonlyArray<ProgressionTrack>, templates: ReadonlyArray<SessionTemplate>, exercises: ReadonlyArray<Exercise>, activeVersions: ReadonlyArray<StrengthFrameVersion>, frameExercise: ReadonlyMap<string, string>, now: string): ProgressionTrack[] {
  const next = tracks.map((track): ProgressionTrack => {
    if (track.closedAt) return track;
    if ((CLOSED_TRACKS_V5 as readonly string[]).includes(track.id)) return { ...track, closedAt: now };
    let changed: ProgressionTrack = track;
    const moved = MOVED_TRACKS_V5[track.id];
    if (moved) changed = { ...changed, ...moved };
    if (track.id === "v2-muscu-c-elevations") changed = { ...changed, references: [...changed.references, { ...ELEVATIONS_C_REFERENCE_V5 }] };
    if ((RECALCULATED_TRACKS_V5 as readonly string[]).includes(track.id) && changed.detailed) {
      changed = { ...changed };
      delete changed.detailed;
    }
    return changed;
  });

  /* Ordre d'affichage : séance A, B, C, puis l'ordre des briques ; les pistes closes en dernier. */
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const versionByExercise = new Map(activeVersions.flatMap((version) => {
    const exerciseId = frameExercise.get(version.frameId);
    return exerciseId ? [[exerciseId, version] as const] : [];
  }));
  const specs = trackSpecsFrom(templates, exerciseById, versionByExercise);
  const rank = new Map(specs.map((spec, index) => [spec.id, index]));
  return next
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (a.track.closedAt ? 1 : 0) - (b.track.closedAt ? 1 : 0) || (rank.get(a.track.id) ?? specs.length + a.index) - (rank.get(b.track.id) ?? specs.length + b.index))
    .map((item) => item.track);
}

async function applyFrame(spec: (typeof FRAMES_V5)[number], now: string): Promise<void> {
  const frame = await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).first();
  if (!frame) return;
  const params = { exerciseId: spec.exerciseId, workSets: spec.workSets, repRange: { ...spec.repRange }, rpeTarget: spec.rpeTarget, restSec: spec.restSec };
  const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();
  const active = versions.find((version) => version.id === frame.activeVersionId);
  if (!active || active.status !== "active") return;
  const change = frameVersion20261005(active, Math.max(0, ...versions.map((version) => version.number)) + 1, params, now);
  if (!change) return;
  await db.strengthFrameVersions.put(change.archived);
  await db.strengthFrameVersions.add(change.next);
  await db.strengthFrames.put({ ...frame, activeVersionId: change.next.id, updatedAt: now });
}

export async function seedProgramMuscuV5(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_V5_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.strengthFrames, db.strengthFrameVersions, db.exercises, db.workouts, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.programmeMuscuV5 !== undefined) return;

    const current = (await db.sessionTemplates.bulkGet(MUSCU_V5_TEMPLATES.map((definition) => definition.id))).filter((template): template is SessionTemplate => template !== undefined);
    const templates = muscuTemplatesV5(current, now);
    if (templates) {
      await db.sessionTemplates.bulkPut(templates);
      for (const spec of FRAMES_V5) await applyFrame(spec, now);

      const stored = (await db.settings.get("progressionTracks"))?.value as ProgressionTrack[] | undefined;
      if (stored) {
        const [allTemplates, exercises, frames, versions, workouts] = await Promise.all([
          db.sessionTemplates.toArray(),
          db.exercises.toArray(),
          db.strengthFrames.toArray(),
          db.strengthFrameVersions.where("status").equals("active").toArray(),
          db.workouts.where("status").equals("completed").toArray(),
        ]);
        const frameExercise = new Map(frames.map((frame) => [frame.id, frame.exerciseId]));
        const moved = tracksV5(stored, allTemplates as SessionTemplate[], exercises as Exercise[], versions as StrengthFrameVersion[], frameExercise, now);
        const tracks = withDetailedReferences(moved, allTemplates as SessionTemplate[], exercises as Exercise[], versions as StrengthFrameVersion[], frameExercise, workouts as WorkoutSession[], now, today);
        await db.settings.put({ key: "progressionTracks", value: tracks });
      }
    }

    await db.settings.put({ key: "install", value: { ...install, programmeMuscuV5: now } });
  });
}

/* -------------------------------------------------------------------------- */
/* Seed 56 — Routine dos + abdos                                               */
/* -------------------------------------------------------------------------- */

export async function seedRoutinesV5(now: string = new Date().toISOString()): Promise<void> {
  if (formatLocalDate(new Date(now)) < PROGRAM_V5_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.exercises, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.routinesV5 !== undefined) return;

    if (!(await db.exercises.get(PONT_FESSIER_ID))) await db.exercises.add(pontFessierExercise(now));

    const templates = (await db.sessionTemplates.toArray()) as SessionTemplate[];
    const known = new Set(templates.map((template) => template.id));
    /* En tête des routines (à la place de la Routine A V4 dans la liste), sinon à la fin. */
    const first = templates.find((template) => template.id === "v4-routine-a")?.position;
    let position = Math.max(0, ...templates.map((template) => template.position)) + 1;
    for (const [index, content] of ROUTINES_V5_TEMPLATES.entries()) {
      if (known.has(content.id)) continue;
      await db.sessionTemplates.add({ ...structuredClone(content), status: "active", position: index === 0 && first !== undefined ? first : position++, createdAt: now, updatedAt: now } as SessionTemplate);
    }

    await db.settings.put({ key: "install", value: { ...install, routinesV5: now } });
  });
}

/* -------------------------------------------------------------------------- */
/* Seed 57 — Cardios et calendrier                                             */
/* -------------------------------------------------------------------------- */

/** La règle hebdomadaire V5, à partir de la règle actuelle (identifiant et date de création gardés). */
export function weeklyProgramV5(program: WeeklyProgram, evening: Partial<Record<Weekday, string>>, now: string): WeeklyProgram {
  const next: WeeklyProgram = { ...program, name: "Programme V5", days: structuredClone(PROGRAM_V5_DAYS), eveningByWeekday: { ...evening }, updatedAt: now };
  delete next.optionalByWeekday;
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
 * Les séances déjà générées à partir de `from`, remises sur la règle
 * (fonction pure). Avant `from`, et pour les séances qui appartiennent à
 * l'utilisateur (faites, démarrées, déplacées, ajoutées, avec un test), rien
 * ne change. `daysToo = false` : seuls les soirs suivent la règle.
 */
export function plannedSessionsV5(sessions: ReadonlyArray<PlannedSession>, from: string, evening: Partial<Record<Weekday, string>>, now: string, daysToo = true): { deleteIds: Id[]; updates: PlannedSession[] } {
  const result: { deleteIds: Id[]; updates: PlannedSession[] } = { deleteIds: [], updates: [] };
  for (const session of sessions) {
    if (session.date < from || !untouched(session)) continue;
    const weekday = getWeekdayOf(session.date);
    const slot = slotOf(session);
    if (slot !== "evening" && (!daysToo || slot !== "day")) continue;
    const target = slot === "evening" ? evening[weekday] : PROGRAM_V5_DAYS.find((day) => day.weekday === weekday)?.sessionTemplateId;
    if (!target) result.deleteIds.push(session.id);
    else if (target !== session.sessionTemplateId) result.updates.push({ ...session, sessionTemplateId: target, sourceWeekday: weekday, updatedAt: now });
  }
  return result;
}

export async function seedCalendrierV5(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_V5_START) return;
  let applied = false;
  await db.transaction("rw", [db.sessionTemplates, db.weeklyPrograms, db.plannedSessions, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.calendrierV5 !== undefined) return;
    applied = true;

    const templates = (await db.sessionTemplates.toArray()) as SessionTemplate[];
    for (const id of CARDIOS_V5_IDS) {
      const template = templates.find((item) => item.id === id);
      if (template) await db.sessionTemplates.put(cardioTemplateV5(template, now));
    }
    for (const id of ARCHIVED_TEMPLATES_V5) {
      const template = templates.find((item) => item.id === id);
      if (template && template.status !== "archived") await db.sessionTemplates.put({ ...template, status: "archived", updatedAt: now });
    }

    const program = (await db.weeklyPrograms.toArray())[0] as WeeklyProgram | undefined;
    if (program) await db.weeklyPrograms.put(weeklyProgramV5(program, EVENING_BY_WEEKDAY_V5_START, now));

    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    if (schedule) await db.settings.put({ key: "testSchedule", value: testScheduleV5(schedule) });

    const sessions = (await db.plannedSessions.where("date").aboveOrEqual(PROGRAM_V5_FIRST_DAY).toArray()) as PlannedSession[];
    const { deleteIds, updates } = plannedSessionsV5(sessions, PROGRAM_V5_FIRST_DAY, EVENING_BY_WEEKDAY_V5_START, now);
    if (deleteIds.length > 0) await db.plannedSessions.bulkDelete(deleteIds);
    if (updates.length > 0) await db.plannedSessions.bulkPut(updates);

    await db.settings.put({ key: "install", value: { ...install, calendrierV5: now } });
  });

  /* La semaine d'activation, complétée à partir d'aujourd'hui (jamais de séance « manquée » dans le passé). */
  if (getWeekStartDate(today) === getWeekStartDate(PROGRAM_V5_FIRST_DAY)) await generateProgramWeek(getWeekStartDate(today), now, today);
  /* Semaines à venir déjà générées en V4 : les jours et soirs que la V4 n'avait pas (cardio du vendredi, soirs du vendredi et du samedi) sont ajoutés. */
  if (applied) await completeFutureWeeks(today, now);
}

async function completeFutureWeeks(today: string, now: string): Promise<void> {
  const current = getWeekStartDate(today);
  const later = (await db.plannedSessions.where("date").above(today).toArray()) as PlannedSession[];
  const weeks = [...new Set(later.map((session) => getWeekStartDate(session.date)))].filter((week) => week > current).sort();
  for (const week of weeks) await generateProgramWeek(week, now);
}

/* -------------------------------------------------------------------------- */
/* Seed 58 — Routine complète à partir du 22/11                                */
/* -------------------------------------------------------------------------- */

/**
 * À partir du dimanche 22/11 (Q10) : la routine complète du dimanche au
 * vendredi, la légère le samedi. Avant cette date : rien, aucun marqueur.
 * Seuls les soirs générés et intacts à partir du 22/11 changent.
 */
export async function seedRoutineDosComplete20261122(now: string = new Date().toISOString()): Promise<void> {
  if (formatLocalDate(new Date(now)) < ROUTINE_DOS_COMPLETE_START) return;
  await db.transaction("rw", [db.weeklyPrograms, db.plannedSessions, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.routineDosComplete20261122 !== undefined) return;
    if (install?.calendrierV5 === undefined) return;

    const program = (await db.weeklyPrograms.toArray())[0] as WeeklyProgram | undefined;
    if (program) await db.weeklyPrograms.put({ ...program, eveningByWeekday: { ...EVENING_BY_WEEKDAY_V5_COMPLETE }, updatedAt: now });

    const sessions = (await db.plannedSessions.where("date").aboveOrEqual(ROUTINE_DOS_COMPLETE_START).toArray()) as PlannedSession[];
    const { deleteIds, updates } = plannedSessionsV5(sessions, ROUTINE_DOS_COMPLETE_START, EVENING_BY_WEEKDAY_V5_COMPLETE, now, false);
    if (deleteIds.length > 0) await db.plannedSessions.bulkDelete(deleteIds);
    if (updates.length > 0) await db.plannedSessions.bulkPut(updates);

    await db.settings.put({ key: "install", value: { ...install, routineDosComplete20261122: now } });
  });
}
