import { db } from "../../db/database";
import type {
  Exercise,
  Id,
  StrengthArchiveReason,
  StrengthFrame,
  StrengthFrameVersion,
  StrengthUnit,
} from "../../domain";
import {
  frameParametersChanged,
  frameTypesFor,
  isVersionFrozen,
  type FrameParameters,
  type RaiseProposal,
} from "../../domain/rules/strengthRules";

/**
 * Cas d'usage des cadres de progression (conception v1.6, § 4.1, § 4.2,
 * § 4.2 bis). Chaque geste est une transaction sur `strengthFrames` et
 * `strengthFrameVersions` ; les jalons ne sont jamais touchés ici — ils
 * naissent à la clôture d'une séance et disparaissent avec elle.
 */

export interface FrameVersionInput extends FrameParameters {
  /** Aide à la saisie par côté (décision 4), hors figeage. */
  barWeightKg?: number;
}

export interface StartingTarget {
  value: number;
  unit: StrengthUnit;
}

export interface FrameWithVersion {
  frame: StrengthFrame;
  version: StrengthFrameVersion;
}

function unitOf(input: FrameParameters): StrengthUnit {
  return input.progressionType === "duree_croissante" ? "sec" : "kg";
}

/** Nettoie une saisie : les champs sans objet pour le type sont omis, jamais `undefined`. */
function normalizeInput(input: FrameVersionInput): FrameVersionInput {
  const duration = input.progressionType === "duree_croissante";
  const clean: FrameVersionInput = {
    progressionType: input.progressionType,
    workSets: input.workSets,
    restSec: input.restSec,
    increment: { unit: unitOf(input), value: input.increment.value },
  };

  if (!duration && input.repRange) clean.repRange = { ...input.repRange };
  if (duration && input.targetDurationSec !== undefined) clean.targetDurationSec = input.targetDurationSec;
  if (input.rpeTarget !== undefined) clean.rpeTarget = input.rpeTarget;
  if (!duration && input.barWeightKg !== undefined) clean.barWeightKg = input.barWeightKg;

  return clean;
}

export function assertFrameInput(exercise: Exercise, input: FrameVersionInput): void {
  if (!frameTypesFor(exercise).includes(input.progressionType)) {
    throw new Error("Ce type de progression ne convient pas à cet exercice");
  }
  if (!Number.isInteger(input.workSets) || input.workSets < 1) {
    throw new Error("Le nombre de séries de travail doit être au moins 1");
  }
  if (input.progressionType === "duree_croissante") {
    if (input.targetDurationSec === undefined || input.targetDurationSec <= 0) {
      throw new Error("Indiquez la durée de départ");
    }
  } else {
    if (!input.repRange || input.repRange.min < 1 || input.repRange.max < input.repRange.min) {
      throw new Error("La plage de répétitions doit être cohérente (min ≤ max)");
    }
    if (input.rpeTarget === undefined) {
      throw new Error("Indiquez la cible de RPE");
    }
  }
  if (input.rpeTarget !== undefined && (input.rpeTarget < 1 || input.rpeTarget > 10)) {
    throw new Error("La cible de RPE est comprise entre 1 et 10");
  }
  if (input.restSec < 0) throw new Error("Le repos ne peut pas être négatif");
  if (input.increment.value <= 0) throw new Error("L'incrément doit être positif");
  if (input.barWeightKg !== undefined && input.barWeightKg < 0) {
    throw new Error("Le poids de la barre ne peut pas être négatif");
  }
}

function buildVersion(
  id: Id,
  frameId: Id,
  number: number,
  input: FrameVersionInput,
  now: string,
): StrengthFrameVersion {
  return {
    id,
    frameId,
    number,
    status: "active",
    ...normalizeInput(input),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Crée le cadre d'un exercice et sa V1 (§ 4.1). Une charge de départ
 * **confirmée** devient l'objectif en cours, sans `fromMilestoneId`
 * (§ 4.2 bis, événement 1) ; la proposition non confirmée n'est pas
 * stockée. Un exercice n'a qu'un cadre.
 */
export async function createFrame(
  exercise: Exercise,
  input: FrameVersionInput,
  startingTarget: StartingTarget | undefined,
  now: string = new Date().toISOString(),
  newId: () => Id = () => crypto.randomUUID(),
): Promise<FrameWithVersion> {
  assertFrameInput(exercise, input);

  return db.transaction("rw", [db.strengthFrames, db.strengthFrameVersions], async () => {
    const existing = await db.strengthFrames.where("exerciseId").equals(exercise.id).first();

    if (existing) throw new Error("Cet exercice a déjà un cadre de progression");

    const frameId = `frame-${newId()}`;
    const versionId = `${frameId}-v1`;
    const version = buildVersion(versionId, frameId, 1, input, now);

    if (startingTarget && input.progressionType !== "duree_croissante") {
      version.currentTarget = { value: startingTarget.value, unit: startingTarget.unit, acceptedAt: now };
    }

    const frame: StrengthFrame = {
      id: frameId,
      exerciseId: exercise.id,
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    };

    await db.strengthFrameVersions.put(version);
    await db.strengthFrames.put(frame);

    return { frame, version };
  });
}

export type FrameUpdateOutcome =
  | { kind: "updated"; version: StrengthFrameVersion }
  | { kind: "new_version"; archived: StrengthFrameVersion; version: StrengthFrameVersion };

/**
 * Modifie la version active (§ 4.2). Tant qu'elle n'est pas figée, tout
 * se corrige en place. Figée, un changement de **paramètre** archive la
 * version (sans motif : remplacée) et crée la suivante, qui naît sans
 * objectif (événement 9) ; un changement de `barWeightKg` seul reste en
 * place, figée ou non (v1.6).
 */
export async function updateFrameVersion(
  exercise: Exercise,
  frame: StrengthFrame,
  input: FrameVersionInput,
  now: string = new Date().toISOString(),
): Promise<FrameUpdateOutcome> {
  assertFrameInput(exercise, input);

  return db.transaction("rw", [db.strengthFrames, db.strengthFrameVersions], async () => {
    const current = await db.strengthFrameVersions.get(frame.activeVersionId);

    if (!current || current.status !== "active") {
      throw new Error("Aucune version active à modifier");
    }

    const clean = normalizeInput(input);

    if (!isVersionFrozen(current) || !frameParametersChanged(current, clean)) {
      const next: StrengthFrameVersion = {
        id: current.id,
        frameId: current.frameId,
        number: current.number,
        status: current.status,
        ...clean,
        ...(current.currentTarget ? { currentTarget: current.currentTarget } : {}),
        ...(current.firstOfficialWorkoutId ? { firstOfficialWorkoutId: current.firstOfficialWorkoutId } : {}),
        ...(current.frozenAt ? { frozenAt: current.frozenAt } : {}),
        createdAt: current.createdAt,
        updatedAt: now,
      };

      /* Un objectif de départ exprimé dans une autre unité (changement de type avant figeage) tombe. */
      if (next.currentTarget && next.currentTarget.unit !== unitOf(clean)) delete next.currentTarget;

      await db.strengthFrameVersions.put(next);

      return { kind: "updated", version: next };
    }

    const archived: StrengthFrameVersion = { ...current, status: "archived", archivedAt: now, updatedAt: now };
    delete archived.currentTarget;

    const versionId = `${frame.id}-v${current.number + 1}`;
    const version = buildVersion(versionId, frame.id, current.number + 1, clean, now);

    await db.strengthFrameVersions.put(archived);
    await db.strengthFrameVersions.put(version);
    await db.strengthFrames.put({ ...frame, activeVersionId: versionId, updatedAt: now });

    return { kind: "new_version", archived, version };
  });
}

/**
 * Archive la version active avec son motif (§ 4.2) ; l'objectif en cours
 * disparaît (événement 9). Le cadre garde son historique ; une nouvelle
 * version se crée ensuite avec `startNextVersion`.
 */
export async function archiveFrameVersion(
  frame: StrengthFrame,
  reason: StrengthArchiveReason,
  now: string = new Date().toISOString(),
): Promise<StrengthFrameVersion> {
  return db.transaction("rw", [db.strengthFrames, db.strengthFrameVersions], async () => {
    const current = await db.strengthFrameVersions.get(frame.activeVersionId);

    if (!current || current.status !== "active") throw new Error("Aucune version active à archiver");

    const archived: StrengthFrameVersion = {
      ...current,
      status: "archived",
      archivedAt: now,
      archiveReason: reason,
      updatedAt: now,
    };
    delete archived.currentTarget;

    await db.strengthFrameVersions.put(archived);
    await db.strengthFrames.put({ ...frame, updatedAt: now });

    return archived;
  });
}

/**
 * Après un archivage : la version suivante, active, sans jalon ni
 * objectif ; une charge de départ confirmée devient l'objectif (événement 1).
 */
export async function startNextVersion(
  exercise: Exercise,
  frame: StrengthFrame,
  input: FrameVersionInput,
  startingTarget: StartingTarget | undefined,
  now: string = new Date().toISOString(),
): Promise<StrengthFrameVersion> {
  assertFrameInput(exercise, input);

  return db.transaction("rw", [db.strengthFrames, db.strengthFrameVersions], async () => {
    const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();

    if (versions.some((version) => version.status === "active")) {
      throw new Error("Une version est déjà active : modifiez-la ou archivez-la");
    }

    const number = Math.max(0, ...versions.map((version) => version.number)) + 1;
    const versionId = `${frame.id}-v${number}`;
    const version = buildVersion(versionId, frame.id, number, input, now);

    if (startingTarget && input.progressionType !== "duree_croissante") {
      version.currentTarget = { value: startingTarget.value, unit: startingTarget.unit, acceptedAt: now };
    }

    await db.strengthFrameVersions.put(version);
    await db.strengthFrames.put({ ...frame, activeVersionId: versionId, updatedAt: now });

    return version;
  });
}

/**
 * « Accepter le nouveau palier » (spec § 7, v1.6 § 4.2 bis événement 5) :
 * le seul geste qui écrit une décision de progression. L'objectif en
 * cours prend le cran suivant, daté, rattaché au jalon qui l'a proposé ;
 * rien d'autre ne bouge — ni séance, ni jalon, ni version (hors figeage).
 * « Rester sur le palier » n'appelle rien.
 */
export async function acceptRaise(
  version: StrengthFrameVersion,
  proposal: RaiseProposal,
  now: string = new Date().toISOString(),
): Promise<StrengthFrameVersion> {
  return db.transaction("rw", [db.strengthFrameVersions, db.strengthMilestones], async () => {
    const current = await db.strengthFrameVersions.get(version.id);

    if (!current || current.status !== "active") throw new Error("Cette version n'est plus active");
    if (proposal.milestone.frameVersionId !== current.id) throw new Error("Ce jalon n'appartient pas à cette version");

    const milestone = await db.strengthMilestones.get(proposal.milestone.id);
    if (!milestone) throw new Error("Le jalon à l'origine de cette hausse n'existe plus");

    const next: StrengthFrameVersion = {
      ...current,
      currentTarget: { value: proposal.value, unit: proposal.unit, acceptedAt: now, fromMilestoneId: milestone.id },
      updatedAt: now,
    };

    await db.strengthFrameVersions.put(next);

    return next;
  });
}
