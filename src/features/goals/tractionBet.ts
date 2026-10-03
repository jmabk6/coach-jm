import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { PerformedExerciseBlock, PerformedSeries, WeightEntry, WorkoutSession } from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { isWorkSeries } from "../../domain/rules/strengthRules";

/**
 * Pari traction du 31/03/2027 (décisions du 03/10/2026) : une traction
 * stricte, avec une machine qui ne règle l'aide que par paliers de 7 kg.
 *
 * - **La performance commande les séances** : la prochaine Muscu A se
 *   déduit de la dernière (palier, répétitions, RPE), jamais du calendrier.
 * - **Le 31/03 est fixe** : le retard se mesure, il ne décale rien.
 * - **Trajectoire ≠ prévision** : la date prévisionnelle n'apparaît qu'après
 *   deux nouveaux paliers validés ; avant, seule la conformité à la
 *   trajectoire est dite.
 * - **La progression dans un palier compte** : 8/8/6 → 8/8/7 → 8/8/8 fait
 *   avancer la position, pas seulement le changement d'aide.
 * - Le poids est une seconde courbe affichée à côté, jamais une équation.
 *
 * Rien n'est stocké : tout se recalcule depuis les séances et les pesées.
 */

export const BET_DEADLINE = "2027-03-31";
export const BET_EXERCISE_ID = "traction-assistee";
/** Les séances de force : la Muscu A du V1 (avant le 04/10) puis du V2. */
export const BET_FORCE_TEMPLATES = ["v1-muscu-a", "v2-muscu-a"];
export const BET_LIGHT_TEMPLATE = "v2-muscu-b";

/** Les paliers de la machine, de l'aide actuelle à la traction stricte. */
export const BET_LEVELS = [42, 35, 28, 21, 14, 7, 0] as const;
/** Un palier est validé à 3 × 8, dernière série à RPE 9 au plus. */
const TARGET_REPS = 8;
const TARGET_SETS = 3;
const MAX_LAST_RPE = 9;
/** Une série d'introduction à un nouveau palier : 6 répétitions. */
const INTRO_REPS = 6;

/** Point de départ réel : 42 kg, 8 / 8 / 6 le 02/10/2026. */
export const BET_START = { date: "2026-10-02", position: 22 / 24 };

/**
 * Trajectoire de référence : la position attendue (paliers validés) à
 * chaque date — oct. 42, nov. 35, déc. 28, janv. 21, févr. 14, mars 7 → 0.
 */
export const BET_TRAJECTORY: ReadonlyArray<{ date: string; position: number; label: string }> = [
  { date: "2026-10-31", position: 1, label: "oct. 42 kg" },
  { date: "2026-11-30", position: 2, label: "nov. 35 kg" },
  { date: "2026-12-31", position: 3, label: "déc. 28 kg" },
  { date: "2027-01-31", position: 4, label: "janv. 21 kg" },
  { date: "2027-02-28", position: 5, label: "févr. 14 kg" },
  { date: "2027-03-21", position: 6, label: "mars 7 kg" },
  { date: "2027-03-31", position: 7, label: "31/03 : 0 kg" },
];

/** Objectifs de poids (seconde courbe, sans équation avec l'aide). */
export const BET_WEIGHT: ReadonlyArray<{ date: string; kg: number }> = [
  { date: "2026-10-02", kg: 93.5 },
  { date: "2026-10-31", kg: 87 },
  { date: "2026-11-30", kg: 83 },
  { date: "2026-12-31", kg: 79 },
  { date: "2027-01-31", kg: 75 },
];

export interface BetSet {
  assistKg: number;
  reps: number;
  rpe?: number;
}

/* -------------------------------------------------------------------------- */
/* Séances                                                                    */
/* -------------------------------------------------------------------------- */

function assistOf(series: PerformedSeries): number | undefined {
  if (series.load?.kind === "total") return series.load.kg;
  if (series.load?.kind === "empty") return 0;
  return undefined;
}

function tractionBlock(workout: WorkoutSession): PerformedExerciseBlock | undefined {
  const block = workout.blocks.find((item) => item.kind === "exercise" && item.exerciseId === BET_EXERCISE_ID);
  return block?.kind === "exercise" ? block : undefined;
}

/** Les séries de travail validées, dans l'ordre. */
export function betSets(block: PerformedExerciseBlock): BetSet[] {
  return [...(block.series ?? [])]
    .filter((series) => series.status === "completed" && isWorkSeries(series))
    .sort((a, b) => a.position - b.position)
    .flatMap((series) => {
      const assistKg = assistOf(series);
      return assistKg === undefined ? [] : [{ assistKg, reps: series.reps ?? 0, ...(series.rpe !== undefined ? { rpe: series.rpe } : {}) }];
    });
}

export interface BetSession {
  workoutId: string;
  date: string;
  sets: BetSet[];
}

/**
 * Les séances de force qui comptent : Muscu A faite, traction à
 * prescription complète (un jour de test, 2 séries seulement : exclu).
 */
export function betSessions(workouts: readonly WorkoutSession[]): BetSession[] {
  return workouts
    .filter((workout) => workout.status === "completed" && BET_FORCE_TEMPLATES.includes(workout.sessionTemplateId ?? ""))
    .flatMap((workout) => {
      const block = tractionBlock(workout);
      if (!block || block.reducedPrescription) return [];
      const sets = betSets(block);
      return sets.length > 0 ? [{ workoutId: workout.id, date: workout.date, sets }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* -------------------------------------------------------------------------- */
/* Position : paliers validés + progression dans le palier                    */
/* -------------------------------------------------------------------------- */

const levelIndex = (assistKg: number) => (BET_LEVELS[0] - assistKg) / 7;

function lastRpe(sets: readonly BetSet[]): number | undefined {
  return sets.at(-1)?.rpe;
}

/** Trois séries au palier, 8 répétitions chacune, dernière à RPE 9 au plus. */
function validates(sets: readonly BetSet[], assistKg: number): boolean {
  const at = sets.filter((set) => set.assistKg === assistKg);
  return at.length >= TARGET_SETS && at.slice(0, TARGET_SETS).every((set) => set.reps >= TARGET_REPS) && (lastRpe(sets) ?? 0) <= MAX_LAST_RPE;
}

/**
 * Position d'une séance, en paliers : 0 = rien de validé à 42 kg ;
 * 1 = 42 kg validé ; … ; 7 = traction stricte. Dans un palier, les
 * répétitions faites au palier le plus dur comptent (8/8/6 à 42 kg → 0,92 ;
 * 35 × 6 en introduction → 1,25).
 */
export function sessionPosition(sets: readonly BetSet[]): number {
  if (sets.some((set) => set.assistKg === 0 && set.reps >= 1)) return BET_LEVELS.length;
  const hardest = Math.min(...sets.map((set) => set.assistKg));
  const index = levelIndex(hardest);
  if (validates(sets, hardest)) return index + 1;
  const reps = sets
    .filter((set) => set.assistKg === hardest)
    .slice(0, TARGET_SETS)
    .reduce((sum, set) => sum + Math.min(set.reps, TARGET_REPS), 0);
  return index + reps / (TARGET_SETS * TARGET_REPS);
}

/* -------------------------------------------------------------------------- */
/* Prescription : la prochaine Muscu A, d'après la dernière                   */
/* -------------------------------------------------------------------------- */

export interface BetPrescription {
  /** Le palier de travail : celui où l'on cherche 3 × 8. */
  levelKg: number;
  sets: BetSet[];
  /** « 8 / 8 / 7 minimum » */
  minimum: string;
  /** « 8 / 8 / 8, dernière série à RPE 9 au plus » */
  validation: string;
  /** « 35 kg, avec une série d'introduction (35 × 6) » */
  next: string;
  /** Le même objectif à refaire (RPE 10) ou la possibilité d'accélérer (RPE ≤ 7). */
  note?: string;
  /** Muscu B : 2 × 10 à cette aide (RPE 6-7). */
  lightAssistKg: number;
}

const repsLabel = (sets: readonly BetSet[]) => sets.map((set) => set.reps).join(" / ");
export const formatBetSets = (sets: readonly BetSet[]) =>
  sets.map((set) => (set.assistKg === 0 ? `traction stricte × ${set.reps}` : `${set.assistKg} × ${set.reps}`)).join(" · ");

/** L'étape d'introduction d'un nouveau palier : `count` séries au nouveau, le reste à l'ancien. */
function introduction(newKg: number, oldKg: number, count: number): BetSet[] {
  if (newKg === 0) return [{ assistKg: 0, reps: 1 }, { assistKg: oldKg, reps: TARGET_REPS }, { assistKg: oldKg, reps: TARGET_REPS }];
  return Array.from({ length: TARGET_SETS }, (_, index) => (index < count ? { assistKg: newKg, reps: INTRO_REPS } : { assistKg: oldKg, reps: TARGET_REPS }));
}

function nextLevelLabel(levelKg: number): string {
  const next = levelKg - 7;
  if (next < 0) return "objectif atteint";
  if (next === 0) return "essai de traction stricte (0 kg) en début de séance";
  return `${next} kg, avec une série d'introduction (${next} × ${INTRO_REPS})`;
}

function finish(levelKg: number, sets: BetSet[], note?: string): BetPrescription {
  const atLevel = sets.filter((set) => set.assistKg === levelKg);
  const mixed = atLevel.length < sets.length;
  return {
    levelKg,
    sets,
    minimum: `${mixed ? formatBetSets(sets) : repsLabel(sets)} minimum`,
    validation: mixed
      ? `${formatBetSets(sets)}, dernière série à RPE ${MAX_LAST_RPE} au plus`
      : `${Array(TARGET_SETS).fill(TARGET_REPS).join(" / ")}, dernière série à RPE ${MAX_LAST_RPE} au plus`,
    next: nextLevelLabel(levelKg),
    ...(note ? { note } : {}),
    lightAssistKg: Math.max(...sets.map((set) => set.assistKg)) + 7,
  };
}

/**
 * La prochaine séance, d'après la dernière :
 * - palier validé (3 × 8, RPE ≤ 9) → introduction du palier suivant
 *   (1 série, puis 2, puis 3) ; très facile (RPE ≤ 7) → l'app propose
 *   d'aller plus vite ;
 * - sinon → une répétition de plus sur la série la plus faible, jusqu'à
 *   3 × 8 ; une dernière série à RPE 10 empêche seulement de changer de
 *   palier (8 / 8 / 6 à RPE 10 → 8 / 8 / 7 ; 8 / 8 / 8 à RPE 10 → 8 / 8 / 8).
 */
export function prescribe(last: readonly BetSet[] | undefined): BetPrescription {
  const sets = last && last.length > 0 ? last : [{ assistKg: 42, reps: 8 }, { assistKg: 42, reps: 8 }, { assistKg: 42, reps: 6 }];
  const hardest = Math.min(...sets.map((set) => set.assistKg));
  const easiest = Math.max(...sets.map((set) => set.assistKg));
  const rpe = lastRpe(sets);
  const easy = sets.every((set) => set.rpe !== undefined && set.rpe <= 7);

  /* Un seul palier : on y cherche 3 × 8. */
  if (hardest === easiest) {
    const level = hardest;
    if (validates(sets, level)) {
      if (level === 0) return finish(0, [{ assistKg: 0, reps: 1 }], "Objectif atteint : 1 traction stricte.");
      return finish(level - 7 === 0 ? 7 : level - 7, introduction(level - 7, level, 1), easy ? "Très facile : vous pouvez faire 2 séries au nouveau palier." : `Palier ${level} kg validé.`);
    }
    const base = Array.from({ length: TARGET_SETS }, (_, index) => sets[index]?.reps ?? 0);
    const weakest = base.lastIndexOf(Math.min(...base));
    const note = rpe !== undefined && rpe > MAX_LAST_RPE ? `RPE ${rpe} sur la dernière série : on reste à ${level} kg.` : undefined;
    return finish(level, base.map((reps, index) => ({ assistKg: level, reps: Math.min(TARGET_REPS, index === weakest ? reps + 1 : reps) })), note);
  }

  /* Transition : quelques séries au nouveau palier, le reste à l'ancien. */
  const count = sets.filter((set) => set.assistKg === hardest).length;
  const ok =
    sets.filter((set) => set.assistKg === hardest).every((set) => set.reps >= INTRO_REPS) &&
    sets.filter((set) => set.assistKg === easiest).every((set) => set.reps >= TARGET_REPS) &&
    (rpe ?? 0) <= MAX_LAST_RPE;
  if (ok) {
    if (count + 1 >= TARGET_SETS) return finish(hardest, introduction(hardest, easiest, TARGET_SETS));
    return finish(hardest, introduction(hardest, easiest, count + 1), easy ? "Très facile : vous pouvez passer les 3 séries au nouveau palier." : undefined);
  }
  return finish(hardest, introduction(hardest, easiest, count), "Introduction pas encore tenue : même étape.");
}

/* -------------------------------------------------------------------------- */
/* Pari : où j'en suis, où je devrais en être, vais-je y arriver              */
/* -------------------------------------------------------------------------- */

/** La position attendue à une date, sur la trajectoire (interpolée). */
export function expectedPosition(date: string): number {
  const points = [BET_START, ...BET_TRAJECTORY];
  if (date <= points[0]!.date) return points[0]!.position;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1]!;
    const after = points[index]!;
    if (date <= after.date) {
      const span = differenceInCalendarDays(parseISO(after.date), parseISO(before.date));
      const done = differenceInCalendarDays(parseISO(date), parseISO(before.date));
      return before.position + ((after.position - before.position) * done) / span;
    }
  }
  return BET_LEVELS.length;
}

/** « 42 kg : 22 / 24 répétitions », « 42 kg validé », « traction stricte ». */
export function formatPosition(position: number): string {
  if (position >= BET_LEVELS.length) return "traction stricte réussie";
  const validated = Math.floor(position + 1e-9);
  const fraction = position - validated;
  const level = BET_LEVELS[validated]!;
  if (fraction < 1e-9) return validated === 0 ? `${level} kg en cours` : `${BET_LEVELS[validated - 1]} kg validé`;
  return `${level} kg en cours (${Math.round(fraction * TARGET_SETS * TARGET_REPS)} / ${TARGET_SETS * TARGET_REPS} répétitions)`;
}

export type BetStatus = "on_track" | "watch" | "late" | "reached";

export interface BetProgress {
  today: string;
  last?: BetSession;
  position: number;
  expected: number;
  /** En paliers : positif = avance, négatif = retard. */
  gap: number;
  status: BetStatus;
  /** « Conforme à la trajectoire », « Dans les temps », « À surveiller », « En retard », « Pari gagné ». */
  statusLabel: string;
  levelsLeft: number;
  weeksLeft: number;
  /** Semaines par palier nécessaires pour finir au 31/03. */
  weeksPerLevelNeeded?: number;
  /** Seulement après deux nouveaux paliers validés : la date où le rythme réel mène à 0 kg. */
  forecast?: string;
  prescription: BetPrescription;
  trajectory: Array<{ date: string; label: string; reached: boolean; due: boolean }>;
  weight: { target: number; last?: { date: string; kg: number } };
}

function weightTarget(date: string): number {
  const points = BET_WEIGHT;
  if (date <= points[0]!.date) return points[0]!.kg;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1]!;
    const after = points[index]!;
    if (date <= after.date) {
      const span = differenceInCalendarDays(parseISO(after.date), parseISO(before.date));
      const done = differenceInCalendarDays(parseISO(date), parseISO(before.date));
      return Math.round((before.kg + ((after.kg - before.kg) * done) / span) * 10) / 10;
    }
  }
  return points.at(-1)!.kg;
}

export function betProgress(
  workouts: readonly WorkoutSession[],
  weights: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>,
  today: string,
): BetProgress {
  const sessions = betSessions(workouts).filter((session) => session.date <= today);
  const last = sessions.at(-1);
  /* La position ne recule pas sous un palier validé ; elle suit la dernière séance. */
  const validated = Math.max(0, ...sessions.map((session) => Math.floor(sessionPosition(session.sets) + 1e-9)));
  const position = Math.max(validated, last ? sessionPosition(last.sets) : BET_START.position, BET_START.position);
  const expected = expectedPosition(today);
  const gap = position - expected;

  const levelsLeft = Math.max(0, BET_LEVELS.length - Math.floor(position + 1e-9));
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(BET_DEADLINE), parseISO(today)));
  const weeksLeft = Math.ceil(daysLeft / 7);
  const remaining = BET_LEVELS.length - position;

  /* Prévision : seulement après deux nouveaux paliers validés depuis le départ. */
  let forecast: string | undefined;
  const newLevels = Math.floor(position + 1e-9) - Math.floor(BET_START.position);
  if (newLevels >= 2 && remaining > 0) {
    const weeksElapsed = differenceInCalendarDays(parseISO(today), parseISO(BET_START.date)) / 7;
    const rate = (position - BET_START.position) / weeksElapsed;
    if (rate > 0) forecast = formatLocalDate(addDays(parseISO(today), Math.ceil((remaining / rate) * 7)));
  }

  let status: BetStatus;
  let statusLabel: string;
  if (remaining <= 0) {
    status = "reached";
    statusLabel = "Pari gagné";
  } else if (gap >= -0.25 && (!forecast || forecast <= BET_DEADLINE)) {
    status = "on_track";
    statusLabel = newLevels >= 2 ? "Dans les temps" : "Conforme à la trajectoire";
  } else if (gap >= -1) {
    status = "watch";
    statusLabel = "À surveiller";
  } else {
    status = "late";
    statusLabel = "En retard";
  }

  const sortedWeights = [...weights].filter((entry) => entry.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const lastWeight = sortedWeights.at(-1);

  return {
    today,
    ...(last ? { last } : {}),
    position,
    expected,
    gap,
    status,
    statusLabel,
    levelsLeft,
    weeksLeft,
    ...(remaining > 0 && weeksLeft > 0 ? { weeksPerLevelNeeded: Math.round((weeksLeft / remaining) * 10) / 10 } : {}),
    ...(forecast ? { forecast } : {}),
    prescription: prescribe(last?.sets),
    trajectory: BET_TRAJECTORY.map((point) => ({
      date: point.date,
      label: point.label,
      reached: position >= point.position - 1e-9,
      due: today > point.date,
    })),
    weight: { target: weightTarget(today), ...(lastWeight ? { last: { date: lastWeight.date, kg: lastWeight.kg } } : {}) },
  };
}

/** Le palier à attaquer au prochain test : un palier plus dur que le palier de travail, pas plus. */
export function testHint(prescription: BetPrescription): string {
  const level = prescription.levelKg;
  if (level <= 7) return "Essai de traction stricte (0 kg) dès l'échauffement fait.";
  return `Au test : commencez à ${level} kg, puis ${level - 7} kg ; inutile de descendre plus bas.`;
}
