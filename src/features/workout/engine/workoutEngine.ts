import type {
  ActiveRest,
  CardioStepSettings,
  Exercise,
  Id,
  Load,
  PerformedBlock,
  PerformedEntryStatus,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  PerformedGroupRound,
  PerformedGroupRoundChild,
  PerformedSeries,
  PerformedSeriesRole,
  PerformedSideValue,
  RestKind,
  WorkoutSession,
} from "../../../domain";
import { defaultInstructionsFor } from "../../../domain/rules/blockInstructionRules";
import {
  createAddedExerciseBlock,
  createSeries,
  createStepFrom,
  findBlock,
  findExerciseBlock,
  findGroupBlock,
  findInsertionIndex,
  findNextExecutableBlock,
  firstPendingEntryId,
  allEntriesCompleted,
  hasCompletedEntries,
  isExecutable,
  isOpenEndedBlock,
  sortBlocks,
  type ExecutableBlock,
} from "./workoutBlocks";
import {
  actualRestSec,
  calculateActiveDurationSec,
  getOpenPause,
  getRestCountdown,
  absenceSec,
  type RestCountdown,
} from "./workoutTime";

/**
 * Moteur de séance (spec v2.9, §11 à §15) : des opérations pures sur la
 * réalisation. Chacune prend la séance et l'instant du geste, rend une
 * nouvelle séance, et ne modifie jamais l'objet reçu. La persistance
 * après chaque geste appartient à `persistWorkout.ts`.
 *
 * Invariants :
 * - une série validée n'est jamais réécrite sans `editSeries` explicite ;
 * - un repos ne démarre qu'après une validation, suit l'horloge réelle
 *   (`targetEndAt`) et ne redémarre jamais ; sa fin réelle est la
 *   validation suivante, `Passer`, ou la clôture de la séance ;
 * - une absence ne change rien ; seule une pause explicite suspend la
 *   durée active ;
 * - la durée active est recalculée à chaque geste depuis les horodatages.
 */

export type NewId = () => Id;

const defaultNewId: NewId = () => crypto.randomUUID();

function isoPlusSec(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

/**
 * Chaque geste met à jour `lastActionAt` et la durée active.
 */
function touch(
  workout: WorkoutSession,
  now: string,
  changes: Partial<WorkoutSession> = {},
): WorkoutSession {
  const next: WorkoutSession = {
    ...workout,
    ...changes,
    lastActionAt: now,
    updatedAt: now,
  };

  next.activeDurationSec = calculateActiveDurationSec(next, now);

  return next;
}

function withBlock(
  workout: WorkoutSession,
  blockId: Id,
  update: (block: PerformedBlock) => PerformedBlock,
): WorkoutSession {
  return {
    ...workout,
    blocks: workout.blocks.map((block) =>
      block.id === blockId ? update(block) : block,
    ),
  };
}

function withExerciseBlock(
  workout: WorkoutSession,
  blockId: Id,
  update: (block: PerformedExerciseBlock) => PerformedExerciseBlock,
): WorkoutSession {
  findExerciseBlock(workout, blockId);

  return withBlock(workout, blockId, (block) =>
    block.kind === "exercise" ? update(block) : block,
  );
}

function withGroupBlock(
  workout: WorkoutSession,
  blockId: Id,
  update: (block: PerformedGroupBlock) => PerformedGroupBlock,
): WorkoutSession {
  findGroupBlock(workout, blockId);

  return withBlock(workout, blockId, (block) =>
    block.kind === "group" ? update(block) : block,
  );
}

function assertInProgress(workout: WorkoutSession): void {
  if (workout.status !== "in_progress") {
    throw new Error("Cette séance est terminée");
  }
}

/* -------------------------------------------------------------------------- */
/* Brique active                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Recalcule le statut de chaque entrée non validée : `active` pour celle
 * désignée, `pending` pour les autres — `upcoming` pendant la séance,
 * `not_performed` à la clôture (rien ne reste « à venir » après).
 */
function setPendingEntries(
  block: ExecutableBlock,
  entryId: Id | undefined,
  pending: PerformedEntryStatus,
): ExecutableBlock {
  const statusOf = (id: Id): PerformedEntryStatus =>
    id === entryId ? "active" : pending;

  if (block.kind === "group") {
    return {
      ...block,
      rounds: block.rounds.map((round) =>
        round.status === "completed"
          ? round
          : { ...round, status: statusOf(round.id) },
      ),
    };
  }

  return {
    ...block,
    ...(block.series
      ? {
          series: block.series.map((series) =>
            series.status === "completed"
              ? series
              : { ...series, status: statusOf(series.id) },
          ),
        }
      : {}),
    ...(block.cardioSteps
      ? {
          cardioSteps: block.cardioSteps.map((step) =>
            step.status === "completed"
              ? step
              : { ...step, status: statusOf(step.id) },
          ),
        }
      : {}),
  };
}

function markActiveEntry(block: ExecutableBlock, entryId: Id | undefined): ExecutableBlock {
  return setPendingEntries(block, entryId, "upcoming");
}

/**
 * Déplie une brique : elle devient la brique courante et sa première
 * entrée non validée devient active. Navigation, pas un geste : la
 * dernière action n'en est pas modifiée.
 */
export function activateBlock(
  workout: WorkoutSession,
  blockId: Id,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findBlock(workout, blockId);

  if (!isExecutable(block)) {
    throw new Error("Une note ne s'exécute pas");
  }

  const entryId = firstPendingEntryId(block);

  const next = withBlock(workout, blockId, (item) =>
    isExecutable(item) ? markActiveEntry(item, entryId) : item,
  );

  return {
    ...next,
    currentBlockId: blockId,
    ...(entryId !== undefined ? { currentEntryId: entryId } : {}),
    updatedAt: now,
  };
}

/**
 * Après une brique terminée ou sautée : la suivante devient courante.
 */
function advanceFrom(workout: WorkoutSession, blockId: Id, now: string): WorkoutSession {
  const nextBlock = findNextExecutableBlock(workout, blockId);

  if (!nextBlock) {
    const cleared: WorkoutSession = { ...workout, currentBlockId: blockId };
    delete cleared.currentEntryId;

    return cleared;
  }

  return activateBlock(workout, nextBlock.id, now);
}

/* -------------------------------------------------------------------------- */
/* Repos                                                                      */
/* -------------------------------------------------------------------------- */

function startRest(
  workout: WorkoutSession,
  kind: RestKind,
  durationSec: number,
  afterBlockId: Id,
  afterEntryId: Id,
  now: string,
  newId: NewId,
): WorkoutSession {
  if (durationSec <= 0) {
    return workout;
  }

  const rest: ActiveRest = {
    id: `rest-${newId()}`,
    kind,
    targetEndAt: isoPlusSec(now, durationSec),
    plannedDurationSec: durationSec,
    startedAt: now,
    afterBlockId,
    afterEntryId,
  };

  return { ...workout, activeRest: rest };
}

/**
 * Fin réelle du repos en cours (§12) : le repos réel est rattaché à la
 * série, au tour ou à l'enfant qui l'a déclenché. `comparable` vaut faux
 * quand la séance se clôt sans validation suivante, et toujours faux si
 * une pause a chevauché le repos.
 */
function closeActiveRest(
  workout: WorkoutSession,
  endedAt: string,
  comparable: boolean,
): WorkoutSession {
  const rest = workout.activeRest;

  if (!rest) {
    return workout;
  }

  const restSec = actualRestSec(rest, endedAt);
  const restComparable = comparable && rest.overlappedPauseId === undefined;
  const adjustment =
    rest.adjustmentSec !== undefined && rest.adjustmentSec !== 0
      ? { restAdjustmentSec: rest.adjustmentSec }
      : {};

  const closed = withBlock(workout, rest.afterBlockId, (block) => {
    if (block.kind === "exercise" && rest.kind === "between_sets") {
      return {
        ...block,
        series: (block.series ?? []).map((series) =>
          series.id === rest.afterEntryId
            ? { ...series, actualRestAfterSec: restSec, restComparable, ...adjustment }
            : series,
        ),
      };
    }

    if (block.kind === "group" && rest.kind === "between_rounds") {
      return {
        ...block,
        rounds: block.rounds.map((round) =>
          round.id === rest.afterEntryId
            ? { ...round, actualRestAfterSec: restSec, restComparable, ...adjustment }
            : round,
        ),
      };
    }

    if (block.kind === "group" && rest.kind === "before_group_child") {
      return {
        ...block,
        rounds: block.rounds.map((round) => ({
          ...round,
          children: round.children.map((child) =>
            child.id === rest.afterEntryId
              ? { ...child, actualRestBeforeSec: restSec }
              : child,
          ),
        })),
      };
    }

    return block;
  });

  const next = { ...closed };
  delete next.activeRest;

  return next;
}

/**
 * `−30 s` / `+30 s` : uniquement le repos en cours ; jamais en dessous
 * de l'instant présent — pas de décompte négatif. Après zéro, `+30 s`
 * relance un décompte de 30 s à partir du geste : le repos réel
 * continue depuis son début initial, la durée prévue est conservée et
 * l'ajustement enregistré (décision du 17/09/2026). `−30 s` n'a plus
 * d'objet après zéro.
 */
export function adjustRest(
  workout: WorkoutSession,
  deltaSec: number,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const rest = workout.activeRest;

  if (!rest) {
    throw new Error("Aucun repos en cours");
  }

  const nowMs = new Date(now).getTime();
  const targetMs = new Date(rest.targetEndAt).getTime();
  const done = targetMs <= nowMs;

  if (done && deltaSec <= 0) {
    return workout;
  }

  const base = done ? nowMs : targetMs;
  const targetEndAt = new Date(Math.max(base + deltaSec * 1000, nowMs)).toISOString();

  return touch(workout, now, {
    activeRest: {
      ...rest,
      targetEndAt,
      adjustmentSec: (rest.adjustmentSec ?? 0) + deltaSec,
    },
  });
}

/**
 * `Passer` : clôt le repos à l'instant du geste — fin réelle — sans
 * valider quoi que ce soit. Le repos est comparable : une série le suit.
 */
export function skipRest(workout: WorkoutSession, now: string): WorkoutSession {
  assertInProgress(workout);

  if (!workout.activeRest) {
    throw new Error("Aucun repos en cours");
  }

  return touch(closeActiveRest(workout, now, true), now);
}

/* -------------------------------------------------------------------------- */
/* Séries                                                                     */
/* -------------------------------------------------------------------------- */

export interface SeriesValues {
  load?: Load;
  reps?: number;
  durationSec?: number;
  sideValues?: PerformedSideValue[];
  rpe?: number;
  /**
   * Rôle et drapeau « limitée par un côté » (v1.6, § 4.4), saisis
   * explicitement dans le formulaire ; jamais dérivés du RPE. Les enfants
   * de tour n'en portent pas : ils sont ignorés pour eux.
   */
  role?: PerformedSeriesRole;
  sideLimited?: boolean;
  note?: string;
}

function hasMeasuredValue(values: SeriesValues): boolean {
  return (
    values.reps !== undefined ||
    values.durationSec !== undefined ||
    (values.sideValues !== undefined && values.sideValues.length > 0)
  );
}

function definedOnly<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * Applique des valeurs à une série. Le drapeau n'a de sens que sur une
 * série de travail : un échauffement n'en porte jamais, même après une
 * modification qui change le rôle.
 */
function applySeriesValues(entry: PerformedSeries, values: SeriesValues): PerformedSeries {
  const next: PerformedSeries = { ...entry, ...definedOnly(values) };

  if (next.role === "echauffement") delete next.sideLimited;

  return next;
}

/** Les valeurs d'un enfant de tour : sans rôle ni drapeau (v1.6, § 4.4). */
function roundChildValues(values: SeriesValues): Omit<SeriesValues, "role" | "sideLimited"> {
  const rest: SeriesValues = { ...values };

  delete rest.role;
  delete rest.sideLimited;

  return rest;
}

function plannedRestAfterSeries(block: PerformedExerciseBlock): number {
  const instructions = block.snapshotInstructions;

  return instructions.shape === "reps" || instructions.shape === "duration"
    ? instructions.restBetweenSetsSec
    : 0;
}

/**
 * Valide une série : le repos en cours trouve sa fin réelle, la série
 * reçoit ses valeurs, la suivante devient active, un repos démarre.
 * Après la dernière série prévue, la brique est réalisée et la suivante
 * devient courante ; le repos démarre quand même — le temps de changer
 * de machine est un repos réel, rattaché à cette série. Une brique sans
 * nombre prévu (ajoutée pendant la séance) reste ouverte après chaque
 * validation : voir `finishBlock`.
 */
export function validateSeries(
  workout: WorkoutSession,
  blockId: Id,
  seriesId: Id,
  values: SeriesValues,
  now: string,
  newId: NewId = defaultNewId,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);
  const series = block.series?.find((item) => item.id === seriesId);

  if (!series) {
    throw new Error("Série introuvable");
  }

  if (series.status === "completed") {
    throw new Error("Cette série est déjà validée : passez par Modifier");
  }

  if (!hasMeasuredValue(values)) {
    throw new Error("Une série validée porte au moins une valeur mesurée");
  }

  let next = closeActiveRest(workout, now, true);

  next = withExerciseBlock(next, blockId, (item) => ({
    ...item,
    series: (item.series ?? []).map((entry) =>
      entry.id === seriesId
        ? {
            ...applySeriesValues(entry, values),
            status: "completed" as const,
            completedAt: now,
          }
        : entry,
    ),
  }));

  next = afterEntryValidated(next, blockId, now);
  next = startRest(
    next,
    "between_sets",
    plannedRestAfterSeries(block),
    blockId,
    seriesId,
    now,
    newId,
  );

  return touch(next, now);
}

/**
 * Suite d'une validation dans une brique : entrée suivante active, ou
 * brique réalisée et brique suivante courante.
 */
function afterEntryValidated(
  workout: WorkoutSession,
  blockId: Id,
  now: string,
): WorkoutSession {
  const block = findBlock(workout, blockId) as ExecutableBlock;

  if (allEntriesCompleted(block)) {
    /* Sans nombre prévu, la brique reste ouverte : `Ajouter une série`
       ou `Terminer l'exercice` décideront (décision du 17/09/2026). */
    if (isOpenEndedBlock(block)) {
      const open: WorkoutSession = { ...workout, currentBlockId: blockId };
      delete open.currentEntryId;

      return open;
    }

    const done = withBlock(workout, blockId, (item) => ({
      ...item,
      status: "performed" as const,
    }));

    return advanceFrom(done, blockId, now);
  }

  const entryId = firstPendingEntryId(block);
  const next = withBlock(workout, blockId, (item) =>
    isExecutable(item) ? markActiveEntry(item, entryId) : item,
  );

  return {
    ...next,
    currentBlockId: blockId,
    ...(entryId !== undefined ? { currentEntryId: entryId } : {}),
  };
}

/**
 * `Modifier` une série terminée : la seule voie pour réécrire une valeur
 * validée. Ne touche ni au statut, ni aux repos, ni à l'avancement.
 */
export function editSeries(
  workout: WorkoutSession,
  blockId: Id,
  seriesId: Id,
  values: SeriesValues,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);
  const series = block.series?.find((item) => item.id === seriesId);

  if (!series || series.status !== "completed") {
    throw new Error("Seule une série validée se modifie");
  }

  const next = withExerciseBlock(workout, blockId, (item) => ({
    ...item,
    series: (item.series ?? []).map((entry) =>
      entry.id === seriesId ? applySeriesValues(entry, values) : entry,
    ),
  }));

  return touch(next, now);
}

/**
 * `Ajouter une série` : la réalité prime sur le snapshot (§11). Une
 * brique déjà réalisée redevient en cours.
 */
export function addSeries(
  workout: WorkoutSession,
  blockId: Id,
  now: string,
  newId: NewId = defaultNewId,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);

  if (!block.series) {
    throw new Error("Cet exercice ne se mesure pas en séries");
  }

  const seriesId = `${blockId}-set-${newId()}`;
  const wasCurrent = workout.currentBlockId === blockId;

  let next = withExerciseBlock(workout, blockId, (item) => ({
    ...item,
    status: item.status === "performed" ? "not_performed" : item.status,
    series: [...(item.series ?? []), createSeries(seriesId, item.series?.length ?? 0)],
  }));

  if (wasCurrent || block.status === "performed") {
    next = activateBlock(next, blockId, now);
  }

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Paliers                                                                    */
/* -------------------------------------------------------------------------- */

export interface StepValues {
  settings?: CardioStepSettings;
  bpm?: number;
  note?: string;
}

function sameSettings(a: CardioStepSettings, b: CardioStepSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Le cardio s'adapte en direct (§11) : modifier un palier à venir
 * remplace la consigne et conserve la consigne d'origine, une seule
 * fois — la première.
 */
export function updateStep(
  workout: WorkoutSession,
  blockId: Id,
  stepId: Id,
  settings: CardioStepSettings,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);
  const step = block.cardioSteps?.find((item) => item.id === stepId);

  if (!step) {
    throw new Error("Palier introuvable");
  }

  if (step.status === "completed") {
    throw new Error("Un palier terminé ne se modifie plus");
  }

  if (sameSettings(step.settings, settings)) {
    return workout;
  }

  const next = withExerciseBlock(workout, blockId, (item) => ({
    ...item,
    cardioSteps: (item.cardioSteps ?? []).map((entry) =>
      entry.id === stepId
        ? {
            ...entry,
            ...(entry.originalSettings === undefined
              ? { originalSettings: structuredClone(entry.settings) }
              : {}),
            settings: structuredClone(settings),
          }
        : entry,
    ),
  }));

  return touch(next, now);
}

/**
 * Valide un palier : la consigne courante fait foi (adaptée au passage
 * si elle diffère), le BPM est relevé s'il l'est, le suivant s'ouvre
 * sans chrono. Aucun repos entre paliers (§12).
 */
export function validateStep(
  workout: WorkoutSession,
  blockId: Id,
  stepId: Id,
  values: StepValues,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);
  const step = block.cardioSteps?.find((item) => item.id === stepId);

  if (!step) {
    throw new Error("Palier introuvable");
  }

  if (step.status === "completed") {
    throw new Error("Ce palier est déjà validé");
  }

  let next = closeActiveRest(workout, now, true);

  if (values.settings) {
    next = updateStep(next, blockId, stepId, values.settings, now);
  }

  next = withExerciseBlock(next, blockId, (item) => ({
    ...item,
    cardioSteps: (item.cardioSteps ?? []).map((entry) =>
      entry.id === stepId
        ? {
            ...entry,
            ...(values.bpm !== undefined ? { bpm: values.bpm } : {}),
            ...(values.note !== undefined ? { note: values.note } : {}),
            status: "completed" as const,
            completedAt: now,
          }
        : entry,
    ),
  }));

  next = afterEntryValidated(next, blockId, now);

  return touch(next, now);
}

/**
 * `Modifier` un palier terminé : la seule voie pour corriger une valeur
 * validée — réglages, BPM, note. Comme pour une série : ni repos, ni
 * changement de palier actif, ni effet sur les autres paliers. Une
 * consigne d'origine déjà conservée n'est jamais écrasée ; un palier
 * corrigé sans trace d'adaptation en reçoit une, la consigne exécutée
 * ayant différé de la consigne affichée (décision du 17/09/2026).
 */
export function editStep(
  workout: WorkoutSession,
  blockId: Id,
  stepId: Id,
  values: StepValues,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);
  const step = block.cardioSteps?.find((item) => item.id === stepId);

  if (!step || step.status !== "completed") {
    throw new Error("Seul un palier validé se modifie");
  }

  const next = withExerciseBlock(workout, blockId, (item) => ({
    ...item,
    cardioSteps: (item.cardioSteps ?? []).map((entry) => {
      if (entry.id !== stepId) return entry;

      const settingsChanged =
        values.settings !== undefined && !sameSettings(entry.settings, values.settings);

      return {
        ...entry,
        ...(settingsChanged && entry.originalSettings === undefined
          ? { originalSettings: structuredClone(entry.settings) }
          : {}),
        ...(settingsChanged && values.settings
          ? { settings: structuredClone(values.settings) }
          : {}),
        ...(values.bpm !== undefined ? { bpm: values.bpm } : {}),
        ...(values.note !== undefined ? { note: values.note } : {}),
      };
    }),
  }));

  return touch(next, now);
}

/**
 * `Ajouter un palier` : reprend les réglages du palier précédent (Q3).
 */
export function addStep(
  workout: WorkoutSession,
  blockId: Id,
  now: string,
  newId: NewId = defaultNewId,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);

  if (!block.cardioSteps) {
    throw new Error("Cet exercice ne se mesure pas en paliers");
  }

  const steps = block.cardioSteps;
  const stepId = `${blockId}-step-${newId()}`;
  const wasCurrent = workout.currentBlockId === blockId;

  let next = withExerciseBlock(workout, blockId, (item) => ({
    ...item,
    status: item.status === "performed" ? "not_performed" : item.status,
    cardioSteps: [
      ...steps,
      createStepFrom(stepId, steps.length, steps[steps.length - 1]),
    ],
  }));

  if (wasCurrent || block.status === "performed") {
    next = activateBlock(next, blockId, now);
  }

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Mesure simple                                                              */
/* -------------------------------------------------------------------------- */

export interface SimpleMeasurementValues {
  durationSec?: number;
  distanceKm?: number;
  distanceCm?: number;
  sideValues?: PerformedSideValue[];
  bpm?: number;
  note?: string;
}

/**
 * Un seul jeu de champs, validé en une fois (§11).
 */
export function validateSimpleMeasurement(
  workout: WorkoutSession,
  blockId: Id,
  values: SimpleMeasurementValues,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);

  if (!block.simpleMeasurement) {
    throw new Error("Cet exercice n'est pas une mesure simple");
  }

  const measured =
    values.durationSec !== undefined ||
    values.distanceKm !== undefined ||
    values.distanceCm !== undefined ||
    (values.sideValues !== undefined && values.sideValues.length > 0);

  if (!measured) {
    throw new Error("Une mesure validée porte au moins une valeur");
  }

  let next = closeActiveRest(workout, now, true);

  next = withExerciseBlock(next, blockId, (item) => ({
    ...item,
    simpleMeasurement: {
      ...item.simpleMeasurement,
      ...definedOnly(values),
      completedAt: now,
    },
  }));

  next = afterEntryValidated(next, blockId, now);

  return touch(next, now);
}

/**
 * `Modifier` une mesure simple validée : la seule voie pour corriger ses
 * valeurs. Ni repos, ni avancement, ni effet sur les autres briques.
 */
export function editSimpleMeasurement(
  workout: WorkoutSession,
  blockId: Id,
  values: SimpleMeasurementValues,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);

  if (!block.simpleMeasurement || block.simpleMeasurement.completedAt === undefined) {
    throw new Error("Seule une mesure validée se modifie");
  }

  const next = withExerciseBlock(workout, blockId, (item) => ({
    ...item,
    simpleMeasurement: { ...item.simpleMeasurement, ...definedOnly(values) },
  }));

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Groupes : tour par tour                                                    */
/* -------------------------------------------------------------------------- */

function orderedRoundChildren(block: PerformedGroupBlock, round: PerformedGroupRound) {
  const positionOf = new Map(block.children.map((child) => [child.id, child.position]));

  return [...round.children].sort(
    (a, b) => (positionOf.get(a.groupChildId) ?? 0) - (positionOf.get(b.groupChildId) ?? 0),
  );
}

/**
 * Valide un enfant du tour courant (§11). Enfant non terminal : le
 * suivant s'ouvre, sans repos sauf `Repos avant cet exercice`. Enfant
 * terminal : fin du tour, repos de groupe, tour suivant actif ; après le
 * dernier tour, la brique est réalisée.
 */
export function validateRoundChild(
  workout: WorkoutSession,
  blockId: Id,
  roundId: Id,
  roundChildId: Id,
  values: SeriesValues,
  now: string,
  newId: NewId = defaultNewId,
): WorkoutSession {
  assertInProgress(workout);

  const block = findGroupBlock(workout, blockId);
  const round = block.rounds.find((item) => item.id === roundId);

  if (!round) {
    throw new Error("Tour introuvable");
  }

  if (round.status === "completed") {
    throw new Error("Ce tour est déjà terminé");
  }

  const child = round.children.find((item) => item.id === roundChildId);

  if (!child) {
    throw new Error("Exercice du tour introuvable");
  }

  if (child.completedAt !== undefined) {
    throw new Error("Cet exercice du tour est déjà validé");
  }

  if (!hasMeasuredValue(values)) {
    throw new Error("Une série validée porte au moins une valeur mesurée");
  }

  let next = closeActiveRest(workout, now, true);

  next = withGroupBlock(next, blockId, (item) => ({
    ...item,
    rounds: item.rounds.map((entry) =>
      entry.id !== roundId
        ? entry
        : {
            ...entry,
            children: entry.children.map((roundChild) =>
              roundChild.id === roundChildId
                ? { ...roundChild, ...definedOnly(roundChildValues(values)), completedAt: now }
                : roundChild,
            ),
          },
    ),
  }));

  const updatedBlock = findGroupBlock(next, blockId);
  const updatedRound = updatedBlock.rounds.find((item) => item.id === roundId)!;
  const ordered = orderedRoundChildren(updatedBlock, updatedRound);
  const pending = ordered.find((item) => item.completedAt === undefined);

  if (pending) {
    const groupChild = updatedBlock.children.find(
      (item) => item.id === pending.groupChildId,
    );
    const restBefore = groupChild?.snapshotRestBeforeSec ?? 0;

    next = { ...next, currentBlockId: blockId, currentEntryId: roundId };
    next = startRest(next, "before_group_child", restBefore, blockId, pending.id, now, newId);

    return touch(next, now);
  }

  next = withGroupBlock(next, blockId, (item) => ({
    ...item,
    rounds: item.rounds.map((entry) =>
      entry.id === roundId
        ? { ...entry, status: "completed" as const, completedAt: now }
        : entry,
    ),
  }));

  const remaining = findGroupBlock(next, blockId).rounds.some(
    (entry) => entry.status !== "completed",
  );

  next = afterEntryValidated(next, blockId, now);

  if (remaining) {
    next = startRest(
      next,
      "between_rounds",
      updatedBlock.plannedRestBetweenRoundsSec,
      blockId,
      roundId,
      now,
      newId,
    );
  }

  return touch(next, now);
}

/**
 * `Modifier` un enfant de tour validé : la seule voie pour réécrire ses
 * valeurs. Ni repos, ni changement de tour, ni effet sur les autres
 * enfants ; l'exercice réellement fait reste celui du tour.
 */
export function editRoundChild(
  workout: WorkoutSession,
  blockId: Id,
  roundId: Id,
  roundChildId: Id,
  values: SeriesValues,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  const block = findGroupBlock(workout, blockId);
  const round = block.rounds.find((item) => item.id === roundId);
  const child = round?.children.find((item) => item.id === roundChildId);

  if (!round || !child || child.completedAt === undefined) {
    throw new Error("Seul un exercice de tour validé se modifie");
  }

  const next = withGroupBlock(workout, blockId, (item) => ({
    ...item,
    rounds: item.rounds.map((entry) =>
      entry.id !== roundId
        ? entry
        : {
            ...entry,
            children: entry.children.map((roundChild) =>
              roundChild.id === roundChildId
                ? { ...roundChild, ...definedOnly(roundChildValues(values)) }
                : roundChild,
            ),
          },
    ),
  }));

  return touch(next, now);
}

/**
 * `Ajouter un tour` en bas du groupe (§11).
 */
export function addRound(
  workout: WorkoutSession,
  blockId: Id,
  now: string,
  newId: NewId = defaultNewId,
): WorkoutSession {
  assertInProgress(workout);

  const block = findGroupBlock(workout, blockId);
  const roundNumber = block.rounds.length + 1;
  const roundId = `${blockId}-round-${newId()}`;
  const wasCurrent = workout.currentBlockId === blockId;

  const round: PerformedGroupRound = {
    id: roundId,
    roundNumber,
    status: "upcoming",
    children: block.children.map((child) => ({
      id: `${roundId}-child-${child.id}`,
      groupChildId: child.id,
      exerciseId: child.exerciseId,
    })),
  };

  let next = withGroupBlock(workout, blockId, (item) => ({
    ...item,
    status: item.status === "performed" ? "not_performed" : item.status,
    rounds: [...item.rounds, round],
  }));

  if (wasCurrent || block.status === "performed") {
    next = activateBlock(next, blockId, now);
  }

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Terminer l'exercice                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `Terminer l'exercice` : clôt explicitement une brique commencée et
 * passe à la suivante. Les entrées jamais validées d'une brique sans
 * nombre prévu sont retirées — elles n'étaient ni prévues ni faites ;
 * celles d'une brique prévue restent et se liront `Non réalisée`. Le
 * repos en cours n'est pas touché : sa fin réelle reste la validation
 * suivante, `Passer` ou la clôture.
 */
export function finishBlock(workout: WorkoutSession, blockId: Id, now: string): WorkoutSession {
  assertInProgress(workout);

  const block = findBlock(workout, blockId);

  if (!isExecutable(block)) {
    throw new Error("Une note ne se termine pas");
  }

  if (block.status === "skipped") {
    throw new Error("Cet exercice est sauté : annulez le saut d'abord");
  }

  if (!hasCompletedEntries(block)) {
    throw new Error("Rien n'a été validé dans cet exercice");
  }

  const openEnded = isOpenEndedBlock(block);

  let next = withBlock(workout, blockId, (item) => {
    if (!isExecutable(item)) return item;

    const settled = markActiveEntry(item, undefined);

    if (!openEnded || settled.kind === "group") {
      return { ...settled, status: "performed" as const };
    }

    return {
      ...settled,
      status: "performed" as const,
      ...(settled.series
        ? {
            series: settled.series
              .filter((series) => series.status === "completed")
              .map((series, position) => ({ ...series, position })),
          }
        : {}),
      ...(settled.cardioSteps
        ? {
            cardioSteps: settled.cardioSteps
              .filter((step) => step.status === "completed")
              .map((step, position) => ({ ...step, position })),
          }
        : {}),
    };
  });

  next = advanceFrom(next, blockId, now);

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Substitution                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Un exercice ne peut en remplacer un autre que s'il se saisit de la
 * même façon : le snapshot des consignes est conservé (§13), il doit
 * rester lisible par le nouvel exercice.
 */
export function canSubstitute(
  replacement: Exercise,
  shape: "reps" | "duration" | "steps" | "simple",
): boolean {
  const defaults = defaultInstructionsFor(replacement, () => "tmp");

  if (shape === "simple") {
    return (
      defaults.shape === "duration_distance" ||
      defaults.shape === "distance" ||
      defaults.shape === "distance_cm" ||
      defaults.shape === "distance_cm_per_side"
    );
  }

  return defaults.shape === shape;
}

function blockShape(block: PerformedExerciseBlock): "reps" | "duration" | "steps" | "simple" {
  const shape = block.snapshotInstructions.shape;

  return shape === "reps" || shape === "duration" || shape === "steps" ? shape : "simple";
}

/**
 * Remplace l'exercice d'une brique autonome (§13). Tant qu'aucune
 * entrée n'est validée : les consignes du snapshot sont conservées,
 * l'exercice d'origine reste connu (`originalExerciseId`, jamais
 * réécrit par un second remplacement) et revenir à l'origine efface la
 * rupture. Une brique commencée ne se remplace plus : on ajoute un
 * exercice à la place.
 */
export function substituteExercise(
  workout: WorkoutSession,
  blockId: Id,
  replacement: Exercise,
  now: string,
  /** Point de capture 3 (§ 4.3) : la version active du cadre du remplaçant, ou rien. */
  frameVersionId?: Id,
): WorkoutSession {
  assertInProgress(workout);

  const block = findExerciseBlock(workout, blockId);

  if (hasCompletedEntries(block)) {
    throw new Error("Un exercice commencé ne se remplace plus : ajoutez un exercice");
  }

  if (block.status === "skipped") {
    throw new Error("Annulez le saut avant de remplacer cet exercice");
  }

  if (!canSubstitute(replacement, blockShape(block))) {
    throw new Error("Cet exercice ne se saisit pas de la même façon que celui prévu");
  }

  const originalExerciseId = block.originalExerciseId ?? block.exerciseId;

  const next = withExerciseBlock(workout, blockId, (item) => {
    const updated: PerformedExerciseBlock = { ...item, exerciseId: replacement.id };

    if (replacement.id === originalExerciseId) {
      delete updated.originalExerciseId;
    } else {
      updated.originalExerciseId = originalExerciseId;
    }

    /* La version de cadre suit l'exercice réellement effectué : celle du
       remplaçant, ou aucune s'il n'a pas de cadre. */
    if (frameVersionId !== undefined) {
      updated.frameVersionId = frameVersionId;
    } else {
      delete updated.frameVersionId;
    }

    return updated;
  });

  return touch(next, now);
}

/**
 * Premier tour où un enfant s'exécute sur un autre exercice que celui
 * prévu, pour le badge `Remplacé à partir du tour N` ; absent si aucun.
 */
export function findSubstitutionRound(
  block: PerformedGroupBlock,
  groupChildId: Id,
): number | undefined {
  const child = block.children.find((item) => item.id === groupChildId);

  if (!child) return undefined;

  const round = [...block.rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .find((entry) =>
      entry.children.some(
        (roundChild) =>
          roundChild.groupChildId === groupChildId && roundChild.exerciseId !== child.exerciseId,
      ),
    );

  return round?.roundNumber;
}

/**
 * Remplace un enfant de groupe pour le tour courant et tous les tours
 * restants — jamais rétroactif (§13). Un tour terminé garde son
 * exercice ; `Revenir à l'origine` est un remplacement par l'exercice
 * prévu ; une même brique peut porter plusieurs ruptures.
 */
export function substituteGroupChild(
  workout: WorkoutSession,
  blockId: Id,
  groupChildId: Id,
  replacement: Exercise,
  now: string,
  /** Point de capture 4 (§ 4.3) : la version du remplaçant, posée tour par tour. */
  frameVersionId?: Id,
): WorkoutSession {
  assertInProgress(workout);

  const block = findGroupBlock(workout, blockId);
  const child = block.children.find((item) => item.id === groupChildId);

  if (!child) {
    throw new Error("Exercice du groupe introuvable");
  }

  if (!canSubstitute(replacement, child.snapshotInstructions.shape)) {
    throw new Error("Cet exercice ne se saisit pas de la même façon que celui prévu");
  }

  let changed = false;

  const next = withGroupBlock(workout, blockId, (item) => ({
    ...item,
    rounds: item.rounds.map((round) => ({
      ...round,
      children: round.children.map((roundChild) => {
        if (
          roundChild.groupChildId !== groupChildId ||
          roundChild.completedAt !== undefined ||
          roundChild.exerciseId === replacement.id
        ) {
          return roundChild;
        }

        changed = true;

        const updated: PerformedGroupRoundChild = { ...roundChild, exerciseId: replacement.id };

        if (frameVersionId !== undefined) {
          updated.frameVersionId = frameVersionId;
        } else {
          delete updated.frameVersionId;
        }

        return updated;
      }),
    })),
  }));

  if (!changed) {
    throw new Error("Aucun tour restant à remplacer");
  }

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Sauter, annuler                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `Sauter l'exercice` (§13) : ni destructeur ni irréversible. La brique
 * reste visible, sort du dénominateur, garde ses données éventuelles.
 */
export function skipBlock(workout: WorkoutSession, blockId: Id, now: string): WorkoutSession {
  assertInProgress(workout);

  const block = findBlock(workout, blockId);

  if (!isExecutable(block)) {
    throw new Error("Une note ne se saute pas");
  }

  if (block.status === "performed") {
    throw new Error("Un exercice réalisé ne se saute plus");
  }

  if (block.status === "skipped") {
    return workout;
  }

  let next = withBlock(workout, blockId, (item) => ({
    ...item,
    status: "skipped" as const,
  }));

  if (workout.currentBlockId === blockId) {
    next = advanceFrom(next, blockId, now);
  }

  return touch(next, now);
}

/**
 * `Annuler` un saut, jusqu'à la clôture : l'exercice réintègre le
 * parcours et le dénominateur.
 */
export function unskipBlock(workout: WorkoutSession, blockId: Id, now: string): WorkoutSession {
  assertInProgress(workout);

  const block = findBlock(workout, blockId);

  if (!isExecutable(block) || block.status !== "skipped") {
    throw new Error("Cet exercice n'est pas sauté");
  }

  const next = withBlock(workout, blockId, (item) => ({
    ...item,
    status: allEntriesCompleted(item as ExecutableBlock)
      ? ("performed" as const)
      : ("not_performed" as const),
  }));

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Ajout d'exercices                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `Ajouter un exercice` (§13) : au point d'insertion, dans l'ordre de
 * sélection, badge `addedDuringWorkout`. Le modèle n'est pas touché —
 * la réalisation seule grandit.
 */
export function addExerciseBlocks(
  workout: WorkoutSession,
  exercises: Exercise[],
  now: string,
  newId: NewId = defaultNewId,
  /** Versions actives par exercice (§ 4.3) : chargées par l'écran, jamais ici. */
  frameVersionByExercise: ReadonlyMap<Id, Id> = new Map(),
): WorkoutSession {
  assertInProgress(workout);

  if (exercises.length === 0) {
    return workout;
  }

  const ordered = sortBlocks(workout.blocks);
  const index = findInsertionIndex(ordered);
  const added = exercises.map((exercise, offset) =>
    createAddedExerciseBlock(exercise, index + offset, newId, frameVersionByExercise.get(exercise.id)),
  );

  const blocks = [...ordered.slice(0, index), ...added, ...ordered.slice(index)].map(
    (block, position) => ({ ...block, position }),
  );

  let next: WorkoutSession = { ...workout, blocks };

  /* Une séance libre vide commence par son premier ajout ; une séance
     planifiée non commencée garde son prévu en tête. */
  if (workout.currentBlockId === undefined && ordered.length === 0) {
    next = activateBlock(next, added[0]!.id, now);
  }

  return touch(next, now);
}

/* -------------------------------------------------------------------------- */
/* Pause explicite                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `Mettre en pause` (§15) : suspend la durée active, rien d'autre. Un
 * repos en cours n'est pas touché ; il devient simplement non comparable.
 * La pause persiste tant que `Reprendre la séance` n'a pas eu lieu.
 */
export function pauseWorkout(
  workout: WorkoutSession,
  now: string,
  newId: NewId = defaultNewId,
): WorkoutSession {
  assertInProgress(workout);

  if (getOpenPause(workout)) {
    throw new Error("La séance est déjà en pause");
  }

  const pauseId = `pause-${newId()}`;

  return touch(workout, now, {
    pauses: [...(workout.pauses ?? []), { id: pauseId, startedAt: now }],
    ...(workout.activeRest
      ? { activeRest: { ...workout.activeRest, overlappedPauseId: pauseId } }
      : {}),
  });
}

/**
 * `Reprendre la séance` : la durée active repart de cet instant.
 */
export function resumeWorkout(workout: WorkoutSession, now: string): WorkoutSession {
  assertInProgress(workout);

  const open = getOpenPause(workout);

  if (!open) {
    throw new Error("La séance n'est pas en pause");
  }

  return touch(workout, now, {
    pauses: (workout.pauses ?? []).map((pause) =>
      pause.id === open.id ? { ...pause, endedAt: now } : pause,
    ),
  });
}

/* -------------------------------------------------------------------------- */
/* Présence et reprise                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Battement de présence : n'est pas un geste (la dernière action ne
 * bouge pas) et ne touche à aucun chrono.
 */
export function recordPresence(workout: WorkoutSession, now: string): WorkoutSession {
  return { ...workout, lastSeenAt: now, updatedAt: now };
}

export interface ResumeSummary {
  startedAt: string;
  lastActionAt: string;
  leftAt: string;
  absenceSec: number;
  activeDurationSec: number;
  paused: boolean;
  currentBlockId?: Id;
  currentEntryId?: Id;
  rest?: RestCountdown & { plannedDurationSec: number };
}

/**
 * Contenu de la feuille `Séance en cours retrouvée` (§15) : que des
 * lectures, aucun effet. Les noms se résolvent à l'affichage.
 */
export function buildResumeSummary(workout: WorkoutSession, now: string): ResumeSummary {
  const rest = workout.activeRest;

  return {
    startedAt: workout.startedAt,
    lastActionAt: workout.lastActionAt,
    leftAt: workout.lastSeenAt ?? workout.lastActionAt,
    absenceSec: absenceSec(workout, now),
    activeDurationSec: calculateActiveDurationSec(workout, now),
    paused: getOpenPause(workout) !== undefined,
    ...(workout.currentBlockId !== undefined
      ? { currentBlockId: workout.currentBlockId }
      : {}),
    ...(workout.currentEntryId !== undefined
      ? { currentEntryId: workout.currentEntryId }
      : {}),
    ...(rest
      ? { rest: { ...getRestCountdown(rest, now), plannedDurationSec: rest.plannedDurationSec } }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Clôture                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `Terminer` comme `Arrêter` (§14, §15) : la pause ouverte se termine,
 * le repos en cours trouve sa fin réelle sans être comparable, chaque
 * brique garde son statut — réalisée dès qu'elle porte une donnée,
 * sautée, ou jamais abordée — et ses entrées non validées deviennent
 * `not_performed`. Rien n'est supprimé, rien n'est complété.
 */
export function completeWorkoutSession(
  workout: WorkoutSession,
  now: string,
): WorkoutSession {
  assertInProgress(workout);

  let next = closeActiveRest(workout, now, false);

  const open = getOpenPause(next);

  if (open) {
    next = {
      ...next,
      pauses: (next.pauses ?? []).map((pause) =>
        pause.id === open.id ? { ...pause, endedAt: now } : pause,
      ),
    };
  }

  const blocks = next.blocks.map((block): PerformedBlock => {
    if (!isExecutable(block)) {
      return block;
    }

    const status =
      block.status === "skipped"
        ? "skipped"
        : hasCompletedEntries(block)
          ? "performed"
          : "not_performed";

    const settled = setPendingEntries(block, undefined, "not_performed");

    return { ...settled, status };
  });

  const completed: WorkoutSession = {
    ...next,
    blocks,
    status: "completed",
    completedAt: now,
    lastActionAt: now,
    updatedAt: now,
  };

  delete completed.currentBlockId;
  delete completed.currentEntryId;

  completed.activeDurationSec = calculateActiveDurationSec(completed, now);

  return completed;
}
