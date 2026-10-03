import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { PerformedExerciseBlock, PerformedSeries, WeightEntry, WorkoutSession } from "../../domain";
import { formatLocalDate, getWeekStartDate } from "../../domain/rules/programRules";
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
/* Rétroplanning : la trajectoire de référence, figée (validée le 03/10/2026)  */
/* -------------------------------------------------------------------------- */

export interface BetPlanRow {
  /** Dimanche de la Muscu A prévue. */
  date: string;
  /** Muscu A prévue, série par série. */
  sets: BetSet[];
  /** Semaine de test : le test en début de Muscu A, puis ces 2 séries. */
  test?: { targetKg: number; note: string };
  /** Repère de la vue mensuelle : « 42 kg validé »… */
  milestone?: string;
  /** Dernière ligne : l'essai réel de traction stricte, validation finale. */
  strict?: true;
}

const p = (assistKg: number, reps: number): BetSet => ({ assistKg, reps });
const three = (assistKg: number, reps: number) => [p(assistKg, reps), p(assistKg, reps), p(assistKg, reps)];

/**
 * Le rétroplanning **figé** jusqu'au 31/03/2027 : 26 dimanches, 42 → 35 →
 * 28 → 21 → 14 → 7 kg, puis l'essai de traction stricte. Il ne se décale
 * jamais : il sert à mesurer l'avance ou le retard ; la séance, elle, suit
 * la performance réelle (`prescribe`).
 */
export const BET_PLAN: readonly BetPlanRow[] = [
  { date: "2026-10-04", sets: [p(42, 8), p(42, 8), p(42, 7)] },
  { date: "2026-10-11", sets: three(42, 8), milestone: "42 kg validé" },
  { date: "2026-10-18", sets: [p(35, 6), p(42, 8), p(42, 8)] },
  { date: "2026-10-25", sets: [p(35, 6), p(35, 6)], test: { targetKg: 21, note: "réussir 21 kg" } },
  { date: "2026-11-01", sets: three(35, 6) },
  { date: "2026-11-08", sets: three(35, 7) },
  { date: "2026-11-15", sets: three(35, 8), milestone: "35 kg validé" },
  { date: "2026-11-22", sets: [p(28, 6), p(35, 8)], test: { targetKg: 21, note: "21 kg facile, essai à 14 kg" } },
  { date: "2026-11-29", sets: [p(28, 6), p(28, 6), p(35, 8)] },
  { date: "2026-12-06", sets: three(28, 6) },
  { date: "2026-12-13", sets: three(28, 7) },
  { date: "2026-12-20", sets: [p(28, 8), p(28, 8)], test: { targetKg: 14, note: "réussir 14 kg" } },
  { date: "2026-12-27", sets: three(28, 8), milestone: "28 kg validé" },
  { date: "2027-01-03", sets: [p(21, 6), p(28, 8), p(28, 8)] },
  { date: "2027-01-10", sets: [p(21, 6), p(21, 6), p(28, 8)] },
  { date: "2027-01-17", sets: [p(21, 6), p(21, 6)], test: { targetKg: 7, note: "réussir 7 kg" } },
  { date: "2027-01-24", sets: three(21, 7) },
  { date: "2027-01-31", sets: three(21, 8), milestone: "21 kg validé" },
  { date: "2027-02-07", sets: [p(14, 6), p(21, 8), p(21, 8)] },
  { date: "2027-02-14", sets: [p(14, 6), p(14, 6)], test: { targetKg: 7, note: "7 kg facile, essai à 0 kg" } },
  { date: "2027-02-21", sets: three(14, 6) },
  { date: "2027-02-28", sets: three(14, 7) },
  { date: "2027-03-07", sets: three(14, 8), milestone: "14 kg validé" },
  { date: "2027-03-14", sets: [p(7, 6), p(14, 8)], test: { targetKg: 7, note: "réussir 7 kg, essai à 0 kg" } },
  { date: "2027-03-21", sets: three(7, 6), milestone: "7 kg en travail" },
  { date: "2027-03-28", sets: [p(0, 1), p(7, 8), p(7, 7), p(7, 7)], milestone: "Traction stricte", strict: true },
];

/**
 * Le **rang d'étape** de chaque ligne, avec la même mesure que les séances
 * (`sessionPosition`) : paliers validés + répétitions au palier le plus
 * dur — les transitions (35 × 6 + 42 × 8…) comptent donc. Chaque ligne
 * est strictement au-dessus de la précédente : une semaine de test (2 séries
 * seulement) ne recule jamais, et n'est pas « atteinte » du seul fait
 * d'avoir réussi la semaine d'avant.
 */
const RANK_STEP = 1e-3;
export const BET_PLAN_RANKS: readonly number[] = BET_PLAN.reduce<number[]>((ranks, row) => {
  const previous = ranks.at(-1) ?? BET_START.position;
  const rank = row.strict ? BET_LEVELS.length : sessionPosition(row.sets);
  return [...ranks, Math.max(rank, previous + RANK_STEP)];
}, []);

/** La ligne la plus avancée que la position réelle égale ou dépasse ; -1 avant la première. */
export function achievedRow(position: number): number {
  let found = -1;
  BET_PLAN_RANKS.forEach((rank, index) => {
    if (rank <= position + 1e-9) found = index;
  });
  return found;
}

/** La ligne de la semaine de `date` (dimanche → samedi) ; -1 avant le 04/10, la dernière après le 28/03. */
export function rowOfWeek(date: string): number {
  const sunday = getWeekStartDate(date);
  if (sunday < BET_PLAN[0]!.date) return -1;
  const index = BET_PLAN.findIndex((row) => row.date === sunday);
  return index >= 0 ? index : BET_PLAN.length - 1;
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
export type RowState = "done" | "late" | "current" | "ahead" | "upcoming";

export interface BetRow {
  index: number;
  row: BetPlanRow;
  state: RowState;
  /** Ce qui a été fait cette semaine-là en Muscu A (séance la plus récente de la semaine). */
  done?: BetSession;
  /** Semaine de test : l'aide minimale obtenue. */
  testResultKg?: number;
}

export interface BetProgress {
  today: string;
  last?: BetSession;
  position: number;
  /** Ligne du rétroplanning que la performance réelle a atteinte (-1 : avant la première). */
  achieved: number;
  /** Ligne qui devrait être atteinte aujourd'hui (-1 : rien d'attendu encore). */
  expected: number;
  /** En semaines : positif = retard, négatif = avance. */
  delayWeeks: number;
  /** « Conforme au rétroplanning », « En avance de 1 semaine », « En retard de 2 semaines ». */
  gapLabel: string;
  status: BetStatus;
  statusLabel: string;
  levelsLeft: number;
  weeksLeft: number;
  /** Semaines par palier nécessaires pour finir au 31/03. */
  weeksPerLevelNeeded?: number;
  /** Seulement après deux nouveaux paliers validés : la date où le rythme réel mène à 0 kg. */
  forecast?: string;
  prescription: BetPrescription;
  /** Vue mensuelle : les repères du rétroplanning, rien d'autre. */
  trajectory: Array<{ date: string; label: string; reached: boolean; due: boolean }>;
  rows: BetRow[];
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

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

interface TestResultLike {
  protocolId: string;
  date: string;
  measures: ReadonlyArray<{ key: string; value: number }>;
}

/** Les séances de force de la semaine, test compris (2 séries) : pour la colonne « Réalisé ». */
function forceSessionsOfWeek(workouts: readonly WorkoutSession[], sunday: string): BetSession[] {
  return workouts
    .filter((workout) => workout.status === "completed" && BET_FORCE_TEMPLATES.includes(workout.sessionTemplateId ?? "") && getWeekStartDate(workout.date) === sunday)
    .flatMap((workout) => {
      const block = tractionBlock(workout);
      const sets = block ? betSets(block) : [];
      return sets.length > 0 ? [{ workoutId: workout.id, date: workout.date, sets }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function betProgress(
  workouts: readonly WorkoutSession[],
  weights: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>,
  today: string,
  testResults: readonly TestResultLike[] = [],
): BetProgress {
  const sessions = betSessions(workouts).filter((session) => session.date <= today);
  const last = sessions.at(-1);
  /* La position ne recule pas sous un palier validé ; elle suit la dernière séance. */
  const validated = Math.max(0, ...sessions.map((session) => Math.floor(sessionPosition(session.sets) + 1e-9)));
  const position = Math.max(validated, last ? sessionPosition(last.sets) : BET_START.position, BET_START.position);

  /* Avance / retard : des ÉTAPES du rétroplanning, comptées en semaines. La séance de la
     semaine en cours n'est attendue qu'une fois faite : avant, on compare à la semaine d'avant. */
  const achieved = achievedRow(position);
  const week = rowOfWeek(today);
  const doneThisWeek = last !== undefined && getWeekStartDate(last.date) === getWeekStartDate(today);
  /* Avant le 04/10, rien n'est encore attendu (-1) : ni avance ni retard. */
  const expected = Math.max(-1, Math.min(BET_PLAN.length - 1, doneThisWeek ? week : week - 1));
  const delayWeeks = expected - achieved;
  const gapLabel =
    delayWeeks === 0 ? "Conforme au rétroplanning" : delayWeeks > 0 ? `En retard de ${plural(delayWeeks, "semaine")}` : `En avance de ${plural(-delayWeeks, "semaine")}`;

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

  /* Statut : vert à l'heure ou en avance ; orange jusqu'à 3 semaines de retard ; rouge au-delà. */
  let status: BetStatus;
  let statusLabel: string;
  if (remaining <= 0) {
    status = "reached";
    statusLabel = "Pari gagné";
  } else if (delayWeeks <= 0 && (!forecast || forecast <= BET_DEADLINE)) {
    status = "on_track";
    statusLabel = newLevels >= 2 ? "Dans les temps" : "Conforme à la trajectoire";
  } else if (delayWeeks <= 3) {
    status = "watch";
    statusLabel = "À surveiller";
  } else {
    status = "late";
    statusLabel = "En retard";
  }

  const currentSunday = getWeekStartDate(today);
  const rows: BetRow[] = BET_PLAN.map((row, index) => {
    const reached = achieved >= index;
    const state: RowState =
      row.date < currentSunday ? (reached ? "done" : "late") : row.date === currentSunday ? (reached ? "done" : "current") : reached ? "ahead" : "upcoming";
    const done = row.date <= currentSunday ? forceSessionsOfWeek(workouts, row.date).filter((session) => session.date <= today).at(-1) : undefined;
    const testResultKg = row.test
      ? testResults
          .filter((result) => result.protocolId === "protocol-traction" && getWeekStartDate(result.date) === row.date && result.date <= today)
          .map((result) => result.measures.find((measure) => measure.key === "assistance_min_kg")?.value)
          .find((value) => value !== undefined)
      : undefined;
    return { index, row, state, ...(done ? { done } : {}), ...(testResultKg !== undefined ? { testResultKg } : {}) };
  });

  const sortedWeights = [...weights].filter((entry) => entry.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const lastWeight = sortedWeights.at(-1);

  return {
    today,
    ...(last ? { last } : {}),
    position,
    achieved,
    expected,
    delayWeeks,
    gapLabel,
    status,
    statusLabel,
    levelsLeft,
    weeksLeft,
    ...(remaining > 0 && weeksLeft > 0 ? { weeksPerLevelNeeded: Math.round((weeksLeft / remaining) * 10) / 10 } : {}),
    ...(forecast ? { forecast } : {}),
    prescription: prescribe(last?.sets),
    trajectory: BET_PLAN.flatMap((row, index) =>
      row.milestone ? [{ date: row.date, label: row.milestone, reached: achieved >= index, due: today > row.date }] : [],
    ),
    rows,
    weight: { target: weightTarget(today), ...(lastWeight ? { last: { date: lastWeight.date, kg: lastWeight.kg } } : {}) },
  };
}

/** Le palier à attaquer au prochain test : un palier plus dur que le palier de travail, pas plus. */
export function testHint(prescription: BetPrescription): string {
  const level = prescription.levelKg;
  if (level <= 7) return "Essai de traction stricte (0 kg) dès l'échauffement fait.";
  return `Au test : commencez à ${level} kg, puis ${level - 7} kg ; inutile de descendre plus bas.`;
}
