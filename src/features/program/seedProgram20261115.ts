import { db } from "../../db/database";
import type { Exercise, ExerciseBlock, Goal, Id, InstallMarkers, PlannedSession, ProgressionTrack, SessionBlock, SessionTemplate, SpeedInclineStepInstruction, StrengthFrameVersion, TestScheduleEntry, WeeklyProgram, WorkoutSession } from "../../domain";
import { formatLocalDate, getSourceDate, getWeekStartDate } from "../../domain/rules/programRules";
import { generateProgramWeek } from "./generateProgramWeek";
import { withDetailedReferences } from "../perspectives/seedPerspectives20261022";
import { buildTrack, trackSpecsFrom } from "../perspectives/tracks";
import type { V4Template } from "./programV4";
import {
  ARCHIVED_TEMPLATES_20261115,
  CLOSED_TRACKS_20261115,
  PROGRAM_4P2_DAYS,
  testSchedule20261115,
  CORE_GOAL_ADDED,
  ECARTE_REFERENCE,
  ECARTE_TRACK,
  ENDURANCE_ID,
  ENDURANCE_NOTE,
  ENDURANCE_STEPS,
  FRACTIONNE_ID,
  FRACTIONNE_NOTE,
  FRACTIONNE_STEPS,
  LEG_BLOCKS,
  LIBRE_TEMPLATES,
  ELEVATIONS_6KG_REFERENCE,
  ELEVATIONS_6KG_TRACKS,
  FRAMES_20261115,
  MOVED_TRACKS_20261115,
  MUSCU_20261115_TEMPLATES,
  MUSCU_D_20261115,
  MUSCU_D_ID,
  muscuDTemplateBase,
  PROGRAM_4P2_START,
  RECALCULATED_TRACKS_20261115,
} from "./program20261115";
import { frameVersion20261005 } from "./seedProgramMuscu20261005";

/**
 * Programme 4+2, lot 1 — seed 60 : Muscu A, B, C (nouveau contenu) et
 * Muscu D (nouveau modèle), **à partir du dimanche 15/11/2026 seulement**.
 * Avant, rien n'est fait et aucun marqueur n'est posé (seed retenté au
 * lancement suivant). Les séances faites et démarrées ne bougent jamais
 * (elles ont leur copie du modèle) ; rien n'est supprimé (pistes closes,
 * cadres versionnés).
 */

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function withBlocks(template: SessionTemplate | Omit<SessionTemplate, "blocks">, definition: V4Template, existing: ReadonlyMap<string, SessionBlock>, now: string): SessionTemplate {
  const blocks = definition.blocks.map((item, position): SessionBlock => {
    if ("keep" in item) return { ...existing.get(item.keep)!, position };
    if ("set" in item) {
      const base = existing.get(item.set.id);
      const next = { ...(base ?? {}), ...structuredClone(item.set), position } as SessionBlock;
      if (base && base.kind === "exercise" && base.outsideFrame && !item.set.outsideFrame) delete (next as { outsideFrame?: true }).outsideFrame;
      if (base && base.kind === "exercise" && base.ownReference) delete (next as { ownReference?: true }).ownReference;
      return next;
    }
    return { ...structuredClone(item.add), position };
  });
  return { ...template, name: definition.name, subtitle: definition.subtitle, tags: [...definition.tags], description: definition.description, blocks, contentSince: PROGRAM_4P2_START, updatedAt: now };
}

/**
 * Les modèles A, B, C et D du programme 4+2 (fonction pure), ou `undefined`
 * si A, B ou C n'a plus exactement ses briques V5, ou si un modèle D existe
 * déjà : les quatre changent ensemble (les briques passent de l'un à l'autre).
 */
export function muscuTemplates20261115(templates: ReadonlyArray<SessionTemplate>, now: string): SessionTemplate[] | undefined {
  const byId = new Map(templates.map((template) => [template.id, template]));
  if (byId.has(MUSCU_D_ID)) return undefined;
  const abc = MUSCU_20261115_TEMPLATES.filter((definition) => definition.id !== MUSCU_D_ID);
  const current = abc.map((definition) => byId.get(definition.id));
  if (current.some((template, index) => !template || !sameIds(template.blocks.map((block) => block.id), abc[index]!.before))) return undefined;
  const existing = new Map(current.flatMap((template) => template!.blocks.map((block) => [block.id, block] as const)));
  /* D se range juste après C dans Séances : les modèles placés après C reculent d'un rang. */
  const position = byId.get("v2-muscu-c")!.position + 1;
  const shifted = templates.filter((template) => template.position >= position && !abc.some((definition) => definition.id === template.id)).map((template) => ({ ...template, position: template.position + 1 }));
  return [
    ...abc.map((definition, index) => withBlocks(current[index]!, definition, existing, now)),
    withBlocks(muscuDTemplateBase(position, now), MUSCU_D_20261115, existing, now),
    ...shifted,
  ];
}

/** Vrai si A, B et C ont exactement leurs briques V5 et qu'aucun modèle D n'existe : le seed s'appliquera. */
export function seedProgram20261115Ready(templates: ReadonlyArray<SessionTemplate>): boolean {
  return muscuTemplates20261115(templates, "") !== undefined;
}

/**
 * Les pistes après la bascule (fonction pure) : déplacées, closes,
 * recalculées ; élévations de B et D repartent d'une référence à 6 kg ;
 * les nouvelles briques (abdos machine, rotary, face pull de D) reçoivent
 * leur piste. Ordre : séance A, B, C, D, puis l'ordre des briques ; les
 * pistes closes en dernier.
 */
export function tracks20261115(
  tracks: ReadonlyArray<ProgressionTrack>,
  templates: ReadonlyArray<SessionTemplate>,
  exercises: ReadonlyArray<Exercise>,
  activeVersions: ReadonlyArray<StrengthFrameVersion>,
  frameExercise: ReadonlyMap<string, string>,
  workouts: ReadonlyArray<WorkoutSession>,
  now: string,
  today: string,
): ProgressionTrack[] {
  const next = tracks.map((track): ProgressionTrack => {
    if (track.closedAt) return track;
    if ((CLOSED_TRACKS_20261115 as readonly string[]).includes(track.id)) return { ...track, closedAt: now };
    let changed: ProgressionTrack = track;
    const moved = MOVED_TRACKS_20261115[track.id];
    if (moved) changed = { ...changed, ...moved };
    if ((ELEVATIONS_6KG_TRACKS as readonly string[]).includes(track.id)) changed = { ...changed, references: [...changed.references, { ...ELEVATIONS_6KG_REFERENCE }] };
    if (track.id === ECARTE_TRACK) changed = { ...changed, references: [...changed.references, { ...ECARTE_REFERENCE }] };
    if ((RECALCULATED_TRACKS_20261115 as readonly string[]).includes(track.id) && changed.detailed) {
      changed = { ...changed };
      delete changed.detailed;
    }
    return changed;
  });

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const versionByExercise = new Map(
    activeVersions.flatMap((version) => {
      const exerciseId = frameExercise.get(version.frameId);
      return exerciseId ? [[exerciseId, version] as const] : [];
    }),
  );
  const specs = trackSpecsFrom(templates, exerciseById, versionByExercise);
  const known = new Set(next.map((track) => track.id));
  for (const spec of specs) {
    if (known.has(spec.id)) continue;
    next.push(buildTrack(spec, specs, workouts, exerciseById.get(spec.exerciseId)?.loadSteps, now, today));
  }

  const rank = new Map(specs.map((spec, index) => [spec.id, index]));
  return next
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (a.track.closedAt ? 1 : 0) - (b.track.closedAt ? 1 : 0) || (rank.get(a.track.id) ?? specs.length + a.index) - (rank.get(b.track.id) ?? specs.length + b.index))
    .map((item) => item.track);
}

async function applyFrame(spec: (typeof FRAMES_20261115)[number], now: string): Promise<void> {
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

export async function seedProgramMuscu20261115(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_4P2_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.strengthFrames, db.strengthFrameVersions, db.exercises, db.workouts, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.programmeMuscu20261115 !== undefined) return;

    const templates = muscuTemplates20261115((await db.sessionTemplates.toArray()) as SessionTemplate[], now);
    if (templates) {
      await db.sessionTemplates.bulkPut(templates);
      for (const spec of FRAMES_20261115) await applyFrame(spec, now);

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
        const moved = tracks20261115(stored, allTemplates as SessionTemplate[], exercises as Exercise[], versions as StrengthFrameVersion[], frameExercise, workouts as WorkoutSession[], now, today);
        const tracks = withDetailedReferences(moved, allTemplates as SessionTemplate[], exercises as Exercise[], versions as StrengthFrameVersion[], frameExercise, workouts as WorkoutSession[], now, today);
        await db.settings.put({ key: "progressionTracks", value: tracks });
      }
    }

    await db.settings.put({ key: "install", value: { ...install, programmeMuscu20261115: now } });
  });
}

/* -------------------------------------------------------------------------- */
/* Seed 61 — Cardios, bloc jambes, séances libres Souplesse et Abdos           */
/* -------------------------------------------------------------------------- */

const FRACTIONNE_BEFORE = ["v2-cardio-b-tapis"];
const ENDURANCE_BEFORE = ["v2-cardio-a-tapis", "v5-cardio-a-montee", "v5-cardio-a-chaise"];

/**
 * Les deux cardios du programme 4+2 (fonction pure), ou `undefined` si l'un
 * d'eux n'a plus exactement ses briques V5 : le fractionné (`v2-cardio-b`)
 * reçoit le bloc jambes, montée et chaise comprises (même brique).
 */
export function cardioTemplates20261115(templates: ReadonlyArray<SessionTemplate>, now: string): SessionTemplate[] | undefined {
  const fractionne = templates.find((template) => template.id === FRACTIONNE_ID);
  const endurance = templates.find((template) => template.id === ENDURANCE_ID);
  if (!fractionne || !endurance) return undefined;
  if (!sameIds(fractionne.blocks.map((block) => block.id), FRACTIONNE_BEFORE) || !sameIds(endurance.blocks.map((block) => block.id), ENDURANCE_BEFORE)) return undefined;
  const tapis = (template: SessionTemplate, steps: SpeedInclineStepInstruction[], notes: string): SessionBlock => {
    const base = template.blocks.find((block) => block.id === `${template.id}-tapis`) as ExerciseBlock;
    return { ...base, position: 0, instructions: { shape: "steps", steps: structuredClone(steps) }, notes };
  };
  return [
    {
      ...fractionne,
      name: "Cardio A — Fractionné + jambes",
      subtitle: "Fractionné en marche inclinée, bloc jambes",
      letter: "A",
      tags: ["Intervalles", "Jambes"],
      description: "Environ 55 min : 36 min de tapis, puis 15-20 min de jambes.",
      position: Math.min(fractionne.position, endurance.position),
      blocks: [tapis(fractionne, FRACTIONNE_STEPS, FRACTIONNE_NOTE), ...LEG_BLOCKS.map((block, index) => ({ ...structuredClone(block), position: index + 1 }))],
      contentSince: PROGRAM_4P2_START,
      updatedAt: now,
    },
    {
      ...endurance,
      name: "Cardio B — Endurance longue",
      subtitle: "Endurance longue sur tapis",
      letter: "B",
      tags: ["Endurance"],
      description: "Environ 55 min.",
      position: Math.max(fractionne.position, endurance.position),
      blocks: [tapis(endurance, ENDURANCE_STEPS, ENDURANCE_NOTE)],
      contentSince: PROGRAM_4P2_START,
      updatedAt: now,
    },
  ];
}

/** L'objectif Tronc avec les exercices de la séance Abdos ; `undefined` s'il les a déjà. */
export function coreGoal20261115(goal: Goal, now: string): Goal | undefined {
  const missing = CORE_GOAL_ADDED.filter((exerciseId) => !goal.linkedExercises.some((link) => link.exerciseId === exerciseId));
  return missing.length === 0 ? undefined : { ...goal, linkedExercises: [...goal.linkedExercises, ...missing.map((exerciseId) => ({ exerciseId }))], updatedAt: now };
}

/**
 * Seed 61 — à partir du dimanche 15/11/2026 seulement : les cardios
 * (fractionné + jambes, endurance longue), les séances libres Souplesse et
 * Abdos (actives, jamais planifiées) et l'objectif Tronc complété. Les
 * séances faites ne bougent pas ; rien n'est supprimé.
 */
export async function seedCardiosLibres20261115(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_4P2_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.goals, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.cardiosLibres20261115 !== undefined) return;

    const templates = (await db.sessionTemplates.toArray()) as SessionTemplate[];
    const cardios = cardioTemplates20261115(templates, now);
    if (cardios) await db.sessionTemplates.bulkPut(cardios);

    let position = Math.max(...templates.map((template) => template.position)) + 1;
    for (const content of LIBRE_TEMPLATES) {
      if (templates.some((template) => template.id === content.id)) continue;
      await db.sessionTemplates.add({ ...structuredClone(content), status: "active", position: position++, createdAt: now, updatedAt: now } as SessionTemplate);
    }

    const core = (await db.goals.where("key").equals("core").first()) as Goal | undefined;
    const withAbdos = core ? coreGoal20261115(core, now) : undefined;
    if (withAbdos) await db.goals.put(withAbdos);

    await db.settings.put({ key: "install", value: { ...install, cardiosLibres20261115: now } });
  });
}

/* -------------------------------------------------------------------------- */
/* Seed 62 — Calendrier du 15/11 et tests                                      */
/* -------------------------------------------------------------------------- */

/** La règle hebdomadaire du programme 4+2 (identifiant et date de création gardés) : plus aucune routine du soir. */
export function weeklyProgram20261115(program: WeeklyProgram, now: string): WeeklyProgram {
  const next: WeeklyProgram = { ...program, name: "Programme 4+2", days: structuredClone(PROGRAM_4P2_DAYS), eveningByWeekday: {}, updatedAt: now };
  delete next.optionalByWeekday;
  delete next.eveningRotation;
  delete next.eveningRotationAnchor;
  return next;
}

/**
 * Une séance que la règle a créée et que personne n'a touchée : pas faite,
 * pas démarrée, pas déplacée, pas retirée. Ses tests éventuels viennent de
 * la règle : elle est recréée avec les tests à leur nouvelle place.
 */
function pristine(session: PlannedSession): boolean {
  return session.source === "weekly_program" && session.status === "upcoming" && !session.workoutId && !session.removedAt && getSourceDate(session) === session.date;
}

/** Les séances à recréer à partir de `from` (fonction pure) : les séances intactes de la règle, jours et soirs. */
export function plannedToRegenerate20261115(sessions: ReadonlyArray<PlannedSession>, from: string): Id[] {
  return sessions.filter((session) => session.date >= from && pristine(session)).map((session) => session.id);
}

/**
 * Seed 62 — à partir du dimanche 15/11/2026 seulement : la règle
 * hebdomadaire 4+2 (plus de routine du soir), le Cardio C et les routines
 * archivés, les tests à leur nouvelle place. Les séances déjà prévues à
 * partir d'aujourd'hui et que personne n'a touchées sont recréées sur la
 * nouvelle règle (semaine de tests du 22/11 comprise, déjà générée sur
 * l'iPhone) ; les séances faites, démarrées, déplacées ou retirées ne
 * bougent pas. Le passage à la routine complète du 22/11 (seed 58) est
 * annulé.
 */
export async function seedCalendrier20261115(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_4P2_START) return;
  let weeks: string[] = [];
  await db.transaction("rw", [db.sessionTemplates, db.weeklyPrograms, db.plannedSessions, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.calendrier20261115 !== undefined) return;

    const templates = (await db.sessionTemplates.toArray()) as SessionTemplate[];
    /* Sans Muscu D (modèles modifiés à la main, seed 60 non appliqué), le calendrier V5 reste : rien n'est touché. */
    if (!templates.some((template) => template.id === MUSCU_D_ID && template.status === "active")) {
      await db.settings.put({ key: "install", value: { ...install, calendrier20261115: now } });
      return;
    }
    for (const id of ARCHIVED_TEMPLATES_20261115) {
      const template = templates.find((item) => item.id === id);
      if (template && template.status !== "archived") await db.sessionTemplates.put({ ...template, status: "archived", updatedAt: now });
    }

    const program = (await db.weeklyPrograms.toArray())[0] as WeeklyProgram | undefined;
    if (program) await db.weeklyPrograms.put(weeklyProgram20261115(program, now));

    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    if (schedule) await db.settings.put({ key: "testSchedule", value: testSchedule20261115(schedule) });

    const sessions = (await db.plannedSessions.where("date").aboveOrEqual(today).toArray()) as PlannedSession[];
    const ids = plannedToRegenerate20261115(sessions, today);
    if (ids.length > 0) await db.plannedSessions.bulkDelete(ids);
    const current = getWeekStartDate(today);
    weeks = [...new Set([current, ...sessions.map((session) => getWeekStartDate(session.date))])].sort();

    await db.settings.put({ key: "install", value: { ...install, calendrier20261115: now, routineDosComplete20261122: install?.routineDosComplete20261122 ?? now } });
  });

  /* La semaine en cours à partir d'aujourd'hui (jamais de séance « manquée » dans le passé), puis les semaines déjà générées. */
  for (const week of weeks) {
    if (week === getWeekStartDate(today)) await generateProgramWeek(week, now, today);
    else await generateProgramWeek(week, now);
  }
}
