import { db } from "../../db/database";
import type {
  Exercise,
  Goal,
  InstallMarkers,
  ProgressionTrack,
  SessionBlock,
  SessionTemplate,
  StrengthFrame,
  StrengthFrameVersion,
  WorkoutSession,
} from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { withDetailedReferences } from "../perspectives/seedPerspectives20261022";
import { buildTrack, trackSpecsFrom } from "../perspectives/tracks";
import {
  CLOSED_TRACKS_V4,
  CURL_POULIE_ID,
  curlPoulieExercise,
  ELEVATIONS_C_REFERENCE,
  FRAMES_V4,
  MOVED_TRACKS_V4,
  MUSCU_V4_TEMPLATES,
  PROGRAM_V4_START,
  RECALCULATED_TRACKS_V4,
  type V4Template,
} from "./programV4";
import { frameVersion20261005 } from "./seedProgramMuscu20261005";

/**
 * Seed 50 (programme V4, lot L3) — Muscu A, B et C de la V4, **à partir du
 * dimanche d'activation seulement** (`PROGRAM_V4_START`) : avant, il ne fait
 * rien et sera retenté au lancement suivant (aucun marqueur posé).
 *
 * Les trois modèles ne changent que s'ils ont encore exactement leurs
 * briques d'avant ; sinon ils restent tels quels. Les séances faites et
 * démarrées ne bougent pas (elles ont leur copie du modèle) ; le pari V6
 * non plus. Pistes : l'écarté et le leg curl suivent leur brique, la presse
 * est close, les élévations de C repartent d'une nouvelle référence, le curl
 * poulie et la position basse reçoivent une piste. Cadres : leg curl
 * 2 × 12-15 (nouvelle version), curl poulie créé ; références détaillées
 * recalculées sur la nouvelle consigne quand le rythme est connu. Objectif Haut du corps :
 * le curl poulie devient un exercice lié.
 */

const [v4Year, v4Month, v4Day] = PROGRAM_V4_START.split("-");
/** Référence des nouvelles pistes : l'historique compte à partir de l'activation. */
export const V4_REFERENCE = { from: PROGRAM_V4_START, reason: `Programme V4 (depuis le ${v4Day}/${v4Month}/${v4Year}).` } as const;

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Les modèles A, B et C de la V4, ou `undefined` si l'un d'eux n'a plus ses
 * briques d'avant (les trois changent ensemble : l'écarté et le leg curl
 * passent de l'un à l'autre).
 */
export function muscuTemplatesV4(templates: ReadonlyArray<SessionTemplate>, now: string): SessionTemplate[] | undefined {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const current = MUSCU_V4_TEMPLATES.map((definition) => byId.get(definition.id));
  if (current.some((template, index) => !template || !sameIds(template.blocks.map((block) => block.id), MUSCU_V4_TEMPLATES[index]!.before))) return undefined;
  const existing = new Map(current.flatMap((template) => template!.blocks.map((block) => [block.id, block] as const)));
  return MUSCU_V4_TEMPLATES.map((definition, index) => withV4Blocks(current[index]!, definition, existing, now));
}

function withV4Blocks(template: SessionTemplate, definition: V4Template, existing: ReadonlyMap<string, SessionBlock>, now: string): SessionTemplate {
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
  return { ...template, name: definition.name, subtitle: definition.subtitle, tags: [...definition.tags], description: definition.description, blocks, updatedAt: now };
}

/**
 * Les pistes après la V4 (fonction pure) : pistes déplacées, closes,
 * recalculées, nouvelle référence des élévations de C, pistes créées pour
 * les nouvelles briques. Une piste déjà close ou absente n'est pas touchée.
 */
export function tracksV4(
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
    if ((CLOSED_TRACKS_V4 as readonly string[]).includes(track.id)) return { ...track, closedAt: now };
    let changed: ProgressionTrack = track;
    const moved = MOVED_TRACKS_V4[track.id];
    if (moved) changed = { ...changed, ...moved };
    if (track.id === "v2-muscu-c-elevations") {
      changed = { ...changed, references: [...changed.references, { ...ELEVATIONS_C_REFERENCE }] };
      delete changed.shareGroup;
    }
    if ((RECALCULATED_TRACKS_V4 as readonly string[]).includes(track.id) && changed.detailed) {
      changed = { ...changed };
      delete changed.detailed;
    }
    return changed;
  });

  /* Pistes des nouvelles briques (curl poulie, position basse) ; les autres nouvelles briques n'ont pas de moteur. */
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const versionByExercise = new Map(activeVersions.flatMap((version) => {
    const exerciseId = frameExercise.get(version.frameId);
    return exerciseId ? [[exerciseId, version] as const] : [];
  }));
  const specs = trackSpecsFrom(templates, exerciseById, versionByExercise).map((spec) => ({ ...spec, reference: { ...V4_REFERENCE } }));
  const known = new Set(next.map((track) => track.id));
  for (const spec of specs) {
    if (known.has(spec.id)) continue;
    next.push(buildTrack(spec, specs, workouts, exerciseById.get(spec.exerciseId)?.loadSteps, now, today));
  }

  /* Les perspectives s'affichent dans l'ordre des pistes : séance A, B, C, puis l'ordre des briques ; les pistes closes en dernier. */
  const rank = new Map(specs.map((spec, index) => [spec.id, index]));
  return next
    .map((track, index) => ({ track, index }))
    .sort((a, b) => (rank.get(a.track.id) ?? specs.length + a.index) - (rank.get(b.track.id) ?? specs.length + b.index))
    .map((item) => item.track);
}

/** L'objectif Haut du corps avec le curl poulie, juste après le curl haltères ; `undefined` s'il l'a déjà. */
export function upperBodyGoalWithCurlPoulie(goal: Goal, now: string): Goal | undefined {
  if (goal.linkedExercises.some((link) => link.exerciseId === CURL_POULIE_ID)) return undefined;
  const after = goal.linkedExercises.findIndex((link) => link.exerciseId === "curl-halteres");
  const linkedExercises = [...goal.linkedExercises];
  linkedExercises.splice(after >= 0 ? after + 1 : linkedExercises.length, 0, { exerciseId: CURL_POULIE_ID });
  return { ...goal, linkedExercises, updatedAt: now };
}

async function applyFrame(spec: (typeof FRAMES_V4)[number], now: string): Promise<void> {
  const frame = await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).first();
  const params = { exerciseId: spec.exerciseId, workSets: spec.workSets, repRange: { ...spec.repRange }, rpeTarget: spec.rpeTarget, restSec: spec.restSec };
  if (!frame) {
    if (!(await db.exercises.get(spec.exerciseId))) return;
    const frameId = `frame-v4-${spec.exerciseId}`;
    const version: StrengthFrameVersion = {
      id: `${frameId}-v1`,
      frameId,
      number: 1,
      status: "active",
      progressionType: "charge_croissante",
      workSets: params.workSets,
      repRange: params.repRange,
      rpeTarget: params.rpeTarget,
      restSec: params.restSec,
      increment: { unit: "kg", value: 2.5 },
      createdAt: now,
      updatedAt: now,
    };
    const created: StrengthFrame = { id: frameId, exerciseId: spec.exerciseId, activeVersionId: version.id, createdAt: now, updatedAt: now };
    await db.strengthFrameVersions.add(version);
    await db.strengthFrames.add(created);
    return;
  }
  const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();
  const active = versions.find((version) => version.id === frame.activeVersionId);
  if (!active || active.status !== "active") return;
  const change = frameVersion20261005(active, Math.max(0, ...versions.map((version) => version.number)) + 1, params, now);
  if (!change) return;
  await db.strengthFrameVersions.put(change.archived);
  await db.strengthFrameVersions.add(change.next);
  await db.strengthFrames.put({ ...frame, activeVersionId: change.next.id, updatedAt: now });
}

export async function seedProgramMuscuV4(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < PROGRAM_V4_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.strengthFrames, db.strengthFrameVersions, db.exercises, db.goals, db.workouts, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.programmeMuscuV4 !== undefined) return;

    if (!(await db.exercises.get(CURL_POULIE_ID))) await db.exercises.add(curlPoulieExercise(now));

    const current = (await db.sessionTemplates.bulkGet(MUSCU_V4_TEMPLATES.map((definition) => definition.id))).filter((template): template is SessionTemplate => template !== undefined);
    const templates = muscuTemplatesV4(current, now);
    if (templates) {
      await db.sessionTemplates.bulkPut(templates);
      for (const spec of FRAMES_V4) await applyFrame(spec, now);

      const upper = (await db.goals.where("key").equals("upper_body").first()) as Goal | undefined;
      const goal = upper ? upperBodyGoalWithCurlPoulie(upper, now) : undefined;
      if (goal) await db.goals.put(goal);

      const stored = (await db.settings.get("progressionTracks"))?.value as ProgressionTrack[] | undefined;
      if (stored) {
        const [allTemplates, exercises, frames, versions, workouts] = await Promise.all([
          db.sessionTemplates.toArray(),
          db.exercises.toArray(),
          db.strengthFrames.toArray(),
          db.strengthFrameVersions.where("status").equals("active").toArray(),
          db.workouts.where("status").equals("completed").toArray(),
        ]);
        const args = [
          allTemplates as SessionTemplate[],
          exercises as Exercise[],
          versions as StrengthFrameVersion[],
          new Map(frames.map((frame) => [frame.id, frame.exerciseId])),
          workouts as WorkoutSession[],
          now,
          today,
        ] as const;
        /* Référence détaillée recalculée tout de suite sur la nouvelle consigne (leg curl, élévations de C). */
        const tracks = withDetailedReferences(tracksV4(stored, ...args), ...args);
        await db.settings.put({ key: "progressionTracks", value: tracks });
      }
    }

    await db.settings.put({ key: "install", value: { ...install, programmeMuscuV4: now } });
  });
}
