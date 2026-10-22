import type {
  DayTarget,
  Id,
  LoadSteps,
  PerformedExerciseBlock,
  PlanWeek,
  SetTarget,
  TrajectoryWeek,
  WorkoutSession,
} from "../models";

/**
 * Perspectives au 31 mars (lot P1, 22/10/2026) — règles pures.
 *
 * Deux usages distincts :
 * - **l'objectif de la prochaine séance** applique des règles concrètes à la
 *   dernière séance comparable (répétitions, RPE série par série, crans
 *   réels) ; il n'utilise jamais la prévision ;
 * - **la prévision au 31 mars** repose sur des hypothèses de calcul
 *   (niveau estimé, rythme borné, ralentissement), affichées comme telles.
 *
 * Le repos réel n'intervient nulle part : le repos prévu est une consigne.
 */

/* -------------------------------------------------------------------------- */
/* Hypothèses de calcul (validées le 22/10/2026, modifiables)                  */
/* -------------------------------------------------------------------------- */

/** Au-delà de +15 % de charge, le cran supérieur passe par une transition. */
export const LARGE_STEP_RATIO = 0.15;
/** Rythme hebdomadaire maximal du niveau estimé : hypothèse de calcul, pas une loi physiologique. */
export const PACE_CAP = 0.015;
/** Le rythme diminue de 7 % chaque semaine (demi-vie ≈ 9 semaines). */
export const PACE_DECAY = 0.93;
/** Fourchette : de 40 % à 130 % du rythme retenu. */
export const BAND_LOW = 0.4;
export const BAND_HIGH = 1.3;
/** Nombre de séances (semaines) retenues pour le rythme. */
export const PACE_WINDOW = 6;
/** En dessous de 5 semaines de séances comparables, la prévision est provisoire. */
export const PROVISIONAL_BELOW = 5;
/** Écart toléré entre réel et trajectoire initiale pour « dans la trajectoire ». */
export const ON_TRACK_TOLERANCE = 0.02;
/** Suspension : +2 s par série quand il reste de la réserve. */
export const DURATION_STEP_SEC = 2;
/** Négatives : descente de 3 s à 5 s, puis une répétition de plus (au plus 4). */
export const NEGATIVE_DESCENT_MIN_SEC = 3;
export const NEGATIVE_DESCENT_MAX_SEC = 5;
export const NEGATIVE_REPS_MAX = 4;

const EPSILON = 1e-6;
const round2 = (value: number) => Math.round(value * 100) / 100;
const formatKg = (value: number) => `${String(round2(value)).replace(".", ",")} kg`;

/* -------------------------------------------------------------------------- */
/* Crans réels                                                                */
/* -------------------------------------------------------------------------- */

/** Les charges possibles jusqu'à `max` (inclus), croissantes. */
export function availableLoads(steps: LoadSteps, max: number): number[] {
  const values = new Set<number>((steps.below ?? []).filter((value) => value <= max + EPSILON));
  for (let value = steps.base; value <= max + EPSILON; value = round2(value + steps.step)) values.add(round2(value));
  return [...values].sort((a, b) => a - b);
}

/** Le cran immédiatement au-dessus de `kg`, toujours une charge réelle. */
export function nextLoadUp(steps: LoadSteps, kg: number): number {
  const below = [...(steps.below ?? [])].sort((a, b) => a - b).find((value) => value > kg + EPSILON);
  if (below !== undefined && below < steps.base) return below;
  if (kg + EPSILON < steps.base) return steps.base;
  const index = Math.floor((kg - steps.base) / steps.step + EPSILON) + 1;
  return round2(steps.base + index * steps.step);
}

/** Le cran immédiatement en dessous de `kg`, ou `undefined` sous le plus petit. */
export function nextLoadDown(steps: LoadSteps, kg: number): number | undefined {
  const candidates = availableLoads(steps, kg).filter((value) => value < kg - EPSILON);
  return candidates.at(-1);
}

/** Plus de +15 % : grand cran, hausse par transition. */
export function isLargeStep(from: number, to: number): boolean {
  return from > 0 && (to - from) / from > LARGE_STEP_RATIO + EPSILON;
}

/* -------------------------------------------------------------------------- */
/* Séances comparables                                                        */
/* -------------------------------------------------------------------------- */

export interface LoadPrescription {
  sets: number;
  repMin: number;
  repMax: number;
  /** Plafond de RPE en vigueur (consigne de la séance, sinon cadre, sinon 8). */
  rpeMax: number;
}

export interface PerformedSet {
  kg: number;
  reps: number;
  rpe?: number;
  durationSec?: number;
  /** Durées de descente par répétition (négatives). */
  repDurationsSec?: number[];
}

export interface SessionResult {
  workoutId: Id;
  date: string;
  /** Séries de travail seulement (jamais d'échauffement), dans l'ordre. */
  sets: PerformedSet[];
}

/** Les séries de travail d'une brique : réalisées, hors échauffement. */
export function workSetsOf(block: PerformedExerciseBlock): PerformedSet[] {
  return [...(block.series ?? [])]
    .sort((a, b) => a.position - b.position)
    .filter((series) => series.status === "completed" && series.role !== "echauffement")
    .flatMap((series): PerformedSet[] => {
      const kg = series.load?.kind === "total" ? series.load.kg : series.load?.kind === "empty" ? 0 : series.load ? undefined : 0;
      if (kg === undefined) return [];
      const reps = series.reps ?? 0;
      return [
        {
          kg,
          reps,
          ...(series.rpe !== undefined ? { rpe: series.rpe } : {}),
          ...(series.durationSec !== undefined ? { durationSec: series.durationSec } : {}),
          ...(series.repDurationsSec ? { repDurationsSec: [...series.repDurationsSec] } : {}),
        },
      ];
    });
}

/**
 * Les séances enregistrées d'une piste (ou d'un groupe partagé), de la plus
 * ancienne à la plus récente : briques réalisées dont la brique du modèle
 * est dans `sourceBlockIds`, à partir de la dernière référence.
 */
export function trackResults(
  workouts: ReadonlyArray<WorkoutSession>,
  sourceBlockIds: ReadonlyArray<Id>,
  from?: string,
): SessionResult[] {
  const wanted = new Set(sourceBlockIds);
  return workouts
    .filter((workout) => workout.status === "completed" && (from === undefined || workout.date >= from))
    .flatMap((workout) =>
      workout.blocks.flatMap((block): SessionResult[] => {
        if (block.kind !== "exercise" || block.status !== "performed" || !block.sourceBlockId || !wanted.has(block.sourceBlockId)) return [];
        const sets = workSetsOf(block);
        return sets.length > 0 ? [{ workoutId: workout.id, date: workout.date, sets }] : [];
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
}

/* -------------------------------------------------------------------------- */
/* Objectif de la prochaine séance — charge et répétitions                     */
/* -------------------------------------------------------------------------- */

export interface LoadTargetInput {
  prescription: LoadPrescription;
  steps?: LoadSteps | undefined;
  last?: SessionResult | undefined;
  suspended?: { reason: string } | undefined;
  /** Groupe partagé : un cran a déjà été pris cette semaine. */
  raiseThisWeek?: boolean;
  now: string;
}

/**
 * Répétitions visées d'une série. Deux notions distinctes : les
 * **répétitions en réserve** (RPE 9 ≈ 1, RPE 8 ≈ 2) et la **marge sous le
 * plafond** du cadre. Une série finie au moins 1 point de RPE sous le
 * plafond avait plus de réserve que le cadre n'en exige : +1 répétition.
 * Une série finie au plafond garde ses répétitions (voir la répétition
 * visée de `nextLoadTarget`).
 */
const repsAfter = (set: PerformedSet, prescription: LoadPrescription): number =>
  set.rpe !== undefined && set.rpe <= prescription.rpeMax - 1 && set.reps < prescription.repMax
    ? set.reps + 1
    : Math.min(set.reps, prescription.repMax);

/**
 * L'objectif de la prochaine séance (règles du 22/10/2026), dans l'ordre :
 * 1. progression suspendue → ni objectif ni charge recommandée ;
 * 2. aucune séance comparable → données insuffisantes ;
 * 3. moins de séries de travail que prévu → à consolider ;
 * 4. une série sous le bas de la fourchette alors qu'un cran plus bas existe → transition ;
 * 5. RPE manquant ou au-dessus du plafond → à consolider (aucun +1 nulle part) ;
 * 6. haut de la fourchette sur toutes les séries dans le plafond → cran supérieur réel
 *    (transition si grand cran ; au plus un cran par semaine dans un groupe partagé) ;
 * 7. sinon, série par série : +1 si la série a fini au moins 1 point de RPE
 *    sous le plafond, sinon mêmes répétitions ; si toutes ont fini au
 *    plafond, +1 visé sur la plus faible, seulement sans dépasser le plafond.
 *
 * Transitions : les séries au nouveau cran passent **toujours en premier**
 * (fraîcheur, et sécurité de la charge la plus lourde) ; une série de plus
 * au nouveau cran seulement quand toutes celles déjà faites au nouveau cran
 * atteignent le bas de la fourchette dans le plafond.
 */
export function nextLoadTarget(input: LoadTargetInput): DayTarget {
  const { prescription: p, steps, last, now } = input;
  const base = { computedAt: now, rpeMax: p.rpeMax, ...(last ? { basisWorkoutId: last.workoutId } : {}) };

  if (input.suspended) {
    return { ...base, kind: "suspended", sets: [], reason: `Progression suspendue (${input.suspended.reason}) : choisis la charge selon tes sensations, aucune hausse proposée.` };
  }
  if (!last || last.sets.length === 0) {
    return { ...base, kind: "insufficient", sets: [], reason: "Pas encore de séance comparable : fais la séance comme prévu, l'objectif suivra." };
  }

  const sets = last.sets.slice(0, p.sets);
  const same = sets.map((set) => ({ kg: set.kg, reps: Math.min(set.reps, p.repMax) }));

  if (sets.length < p.sets) {
    return { ...base, kind: "consolidate", sets: [...same, ...Array.from({ length: p.sets - sets.length }, () => ({ kg: sets.at(-1)!.kg, reps: p.repMin }))], reason: `Séance précédente incomplète (${sets.length} séries sur ${p.sets}) : reproduire avant de progresser.` };
  }

  const heavy = Math.max(...sets.map((set) => set.kg));
  const light = Math.min(...sets.map((set) => set.kg));

  /* Une série sous le bas de la fourchette après une hausse : retour à une transition. */
  if (light === heavy && steps && sets.some((set) => set.reps < p.repMin)) {
    const lower = nextLoadDown(steps, heavy);
    if (lower !== undefined) {
      const kept = leadingCount(sets, (set) => set.reps >= p.repMin && set.rpe !== undefined && set.rpe <= p.rpeMax);
      return {
        ...base,
        kind: "transition",
        sets: sets.map((set, index): SetTarget => (index < kept ? { kg: heavy, reps: Math.min(set.reps, p.repMax), step: "new" } : { kg: lower, reps: p.repMax, step: "previous" })),
        reason:
          kept === 0
            ? `Séries sous ${p.repMin} répétitions à ${formatKg(heavy)} : retour à ${formatKg(lower)}.`
            : `Une série sous ${p.repMin} répétitions à ${formatKg(heavy)} : ${kept} série${kept > 1 ? "s" : ""} à ${formatKg(heavy)}, les autres à ${formatKg(lower)}.`,
      };
    }
  }

  const missing = sets.some((set) => set.rpe === undefined);
  const over = sets.filter((set) => set.rpe !== undefined && set.rpe > p.rpeMax);
  if (missing) {
    return { ...base, kind: "consolidate", sets: same, reason: "RPE manquant à la séance précédente : reproduire en notant le ressenti de chaque série." };
  }
  if (over.length > 0) {
    const worst = Math.max(...over.map((set) => set.rpe!));
    return { ...base, kind: "consolidate", sets: same, reason: `RPE ${worst} au-dessus du plafond ${p.rpeMax} : reproduire sans dépasser RPE ${p.rpeMax}.` };
  }

  /* Transition en cours : séries au nouveau cran et séries à l'ancien, dans l'ordre où elles ont été faites. */
  if (light !== heavy) {
    const heavySets = sets.filter((set) => set.kg === heavy);
    const lightSets = sets.filter((set) => set.kg !== heavy);
    const heavyReady = heavySets.every((set) => set.reps >= p.repMin);
    const nextHeavy = Math.min(p.sets, heavySets.length + (heavyReady ? 1 : 0));
    const done = nextHeavy === p.sets;
    const step = (value: "new" | "previous") => (done ? {} : { step: value });
    /* Nouveau cran en premier, quel que soit l'ordre de la séance précédente. */
    const target: SetTarget[] = [
      ...heavySets.map((set): SetTarget => ({ kg: heavy, reps: repsAfter(set, p), ...step("new") })),
      ...(nextHeavy > heavySets.length ? [{ kg: heavy, reps: p.repMin, ...step("new") }] : []),
      ...lightSets.slice(nextHeavy - heavySets.length).map((set): SetTarget => ({ kg: set.kg, reps: repsAfter(set, p), ...step("previous") })),
    ];
    return {
      ...base,
      kind: done ? "progress" : "transition",
      sets: target,
      reason: done
        ? `Transition terminée : toutes les séries à ${formatKg(heavy)}.`
        : heavyReady
          ? `Transition vers ${formatKg(heavy)}, une série de plus au nouveau cran ; ${describeTransition(target)}.`
          : `Transition vers ${formatKg(heavy)} : atteindre ${p.repMin} répétitions au nouveau cran avant d'en ajouter une série ; ${describeTransition(target)}.`,
    };
  }

  const validated = sets.every((set) => set.reps >= p.repMax);
  if (validated) {
    if (!steps) return { ...base, kind: "repeat", sets: same, reason: "Palier validé ; crans de la machine à confirmer avant de proposer la hausse." };
    if (input.raiseThisWeek) return { ...base, kind: "repeat", sets: same, reason: "Palier validé ; un cran par semaine pour cet exercice : la hausse viendra la semaine prochaine." };
    const up = nextLoadUp(steps, heavy);
    if (isLargeStep(heavy, up)) {
      return {
        ...base,
        kind: "transition",
        sets: sets.map((_, index): SetTarget => (index === 0 ? { kg: up, reps: p.repMin, step: "new" } : { kg: heavy, reps: p.repMax, step: "previous" })),
        reason: `Palier ${formatKg(heavy)} validé ; ${formatKg(up)} est un grand cran (+${Math.round(((up - heavy) / heavy) * 100)} %) : 1 série à ${formatKg(up)}, les autres à ${formatKg(heavy)}.`,
      };
    }
    return { ...base, kind: "raise", sets: sets.map(() => ({ kg: up, reps: p.repMin })), reason: `Palier ${formatKg(heavy)} validé : ${formatKg(up)}, retour à ${p.repMin} répétitions.` };
  }

  const target: SetTarget[] = sets.map((set) => ({ kg: set.kg, reps: repsAfter(set, p) }));
  const gained = target.some((set, index) => set.reps! > Math.min(sets[index]!.reps, p.repMax));
  if (gained) {
    return { ...base, kind: "progress", sets: target, reason: `+1 répétition sur les séries finies sous le plafond (RPE ${p.rpeMax - 1} ou moins) : il restait plus de réserve que le plafond n'en demande.` };
  }

  /* Toutes les séries au plafond (RPE accepté, pas un échec) : +1 visé sur la plus faible, seulement dans le plafond. */
  /* À égalité, la première des plus faibles (la plus fraîche) : la progression ne se concentre pas sur la dernière série. */
  const weakest = sets.reduce<number | undefined>((best, set, index) => (set.reps < p.repMax && (best === undefined || set.reps < sets[best]!.reps) ? index : best), undefined);
  if (weakest === undefined) {
    return { ...base, kind: "repeat", sets: target, reason: `Séries finies au plafond RPE ${p.rpeMax} : mêmes répétitions.` };
  }
  target[weakest] = { kg: sets[weakest]!.kg, reps: sets[weakest]!.reps + 1, stretch: true };
  return {
    ...base,
    kind: "progress",
    sets: target,
    reason: `Séries au plafond RPE ${p.rpeMax} (accepté) : +1 visé à la série ${weakest + 1}, seulement sans dépasser RPE ${p.rpeMax} ; refaire ${sets[weakest]!.reps} compte comme atteint.`,
  };
}

/** « série 1 à 5 kg (ancien cran), séries 2 et 3 à 7,5 kg (nouveau cran) » : les rôles d'une transition, explicites. */
export function describeTransition(sets: ReadonlyArray<SetTarget>): string {
  const group = (step: "previous" | "new") => sets.flatMap((set, index) => (set.step === step ? [index + 1] : []));
  const label = (indexes: number[]) => (indexes.length === 1 ? `série ${indexes[0]}` : `séries ${indexes.slice(0, -1).join(", ")} et ${indexes.at(-1)}`);
  const groups = (["new", "previous"] as const)
    .map((step) => ({ step, indexes: group(step) }))
    .filter((item) => item.indexes.length > 0)
    .sort((a, b) => a.indexes[0]! - b.indexes[0]!);
  const parts = groups.map((item) => `${label(item.indexes)} à ${formatKg(sets[item.indexes[0]! - 1]!.kg!)} (${item.step === "new" ? "nouveau" : "ancien"} cran)`);
  return `toutes des séries de travail : ${parts.join(", ")}`;
}

function leadingCount<T>(items: readonly T[], keep: (item: T) => boolean): number {
  const index = items.findIndex((item) => !keep(item));
  return index < 0 ? items.length : index;
}

/**
 * Groupe partagé (élévations latérales en A, B, C) : un cran a-t-il déjà
 * été pris cette semaine ? Une séance de la semaine de `date`, antérieure à
 * `date`, à une charge plus haute que toutes celles des semaines d'avant.
 */
export function raiseTakenThisWeek(results: ReadonlyArray<SessionResult>, date: string): boolean {
  const week = mondayOf(date);
  const before = results.filter((result) => mondayOf(result.date) < week);
  if (before.length === 0) return false;
  const previousMax = Math.max(...before.flatMap((result) => result.sets.map((set) => set.kg)));
  return results.some((result) => mondayOf(result.date) === week && result.date < date && result.sets.some((set) => set.kg > previousMax + EPSILON));
}

/* -------------------------------------------------------------------------- */
/* Objectif de la prochaine séance — suspension et négatives                   */
/* -------------------------------------------------------------------------- */

export interface DurationPrescription {
  sets: number;
  durationMin: number;
  durationMax: number;
  rpeMax: number;
}

/** Suspension sans charge : +2 s par série quand il reste de la réserve, jusqu'au haut de la consigne. */
export function nextDurationTarget(prescription: DurationPrescription, last: SessionResult | undefined, now: string): DayTarget {
  const p = prescription;
  const base = { computedAt: now, rpeMax: p.rpeMax, ...(last ? { basisWorkoutId: last.workoutId } : {}) };
  if (!last || last.sets.length === 0) {
    return { ...base, kind: "insufficient", sets: [], reason: "Pas encore de séance comparable sans assistance : fais la séance comme prévu." };
  }
  const sets = last.sets.slice(0, p.sets);
  const same = sets.map((set) => ({ durationSec: Math.min(set.durationSec ?? 0, p.durationMax) }));
  if (sets.length < p.sets) return { ...base, kind: "consolidate", sets: same, reason: `Séance précédente incomplète (${sets.length} séries sur ${p.sets}).` };
  if (sets.some((set) => set.rpe === undefined)) return { ...base, kind: "consolidate", sets: same, reason: "RPE manquant : reproduire en notant le ressenti." };
  if (sets.some((set) => set.rpe! > p.rpeMax)) return { ...base, kind: "consolidate", sets: same, reason: `RPE au-dessus de ${p.rpeMax} : reproduire dans la règle.` };
  if (sets.every((set) => (set.durationSec ?? 0) >= p.durationMax)) {
    return { ...base, kind: "repeat", sets: same, reason: `${p.durationMax} s tenues sur chaque série : haut de la consigne atteint.` };
  }
  const target = sets.map((set) => ({
    durationSec: set.rpe! <= p.rpeMax - 1 ? Math.min((set.durationSec ?? 0) + DURATION_STEP_SEC, p.durationMax) : Math.min(set.durationSec ?? 0, p.durationMax),
  }));
  const gained = target.some((set, index) => set.durationSec > (sets[index]!.durationSec ?? 0));
  return gained
    ? { ...base, kind: "progress", sets: target, reason: `+${DURATION_STEP_SEC} s sur les séries faites avec de la réserve.` }
    : { ...base, kind: "repeat", sets: target, reason: "Séries tenues au plafond de RPE : mêmes durées." };
}

/** Négatives : la descente s'allonge de 3 à 5 s, puis une répétition de plus (au plus 4), descente ramenée à 3 s. */
export function nextNegativesTarget(sets: number, last: SessionResult | undefined, now: string): DayTarget {
  const base = { computedAt: now, ...(last ? { basisWorkoutId: last.workoutId } : {}) };
  if (!last || last.sets.length === 0) {
    return { ...base, kind: "insufficient", sets: [], reason: "Pas encore de séance de négatives : la progression démarrera après la première." };
  }
  const done = last.sets.slice(0, sets);
  const reps = Math.min(...done.map((set) => set.reps));
  const slowest = Math.min(...done.flatMap((set) => (set.repDurationsSec?.length ? set.repDurationsSec : [set.durationSec ?? 0])));
  if (done.length < sets) {
    return { ...base, kind: "consolidate", sets: Array.from({ length: sets }, () => ({ reps, durationSec: Math.max(slowest, NEGATIVE_DESCENT_MIN_SEC) })), reason: `Séance précédente incomplète (${done.length} séries sur ${sets}).` };
  }
  if (slowest >= NEGATIVE_DESCENT_MAX_SEC && reps < NEGATIVE_REPS_MAX) {
    return { ...base, kind: "progress", sets: Array.from({ length: sets }, () => ({ reps: reps + 1, durationSec: NEGATIVE_DESCENT_MIN_SEC })), reason: `Descentes de ${NEGATIVE_DESCENT_MAX_SEC} s tenues : une répétition de plus, descente ramenée à ${NEGATIVE_DESCENT_MIN_SEC} s.` };
  }
  if (slowest >= NEGATIVE_DESCENT_MAX_SEC) {
    return { ...base, kind: "repeat", sets: Array.from({ length: sets }, () => ({ reps, durationSec: NEGATIVE_DESCENT_MAX_SEC })), reason: "Plafond des négatives atteint : maintien, la suite se décide dans le programme." };
  }
  const descent = Math.min(Math.max(Math.floor(slowest), NEGATIVE_DESCENT_MIN_SEC - 1) + 1, NEGATIVE_DESCENT_MAX_SEC);
  return { ...base, kind: "progress", sets: Array.from({ length: sets }, () => ({ reps, durationSec: descent })), reason: `Descente visée : ${descent} s par répétition, sans dépasser ${NEGATIVE_DESCENT_MAX_SEC} s.` };
}

/* -------------------------------------------------------------------------- */
/* Retour après la dernière série                                              */
/* -------------------------------------------------------------------------- */

export type SessionOutcome =
  | { kind: "reached"; text: string }
  | { kind: "exceeded"; text: string }
  | { kind: "consolidate"; text: string }
  | { kind: "incomplete"; text: string };

/** Le retour court après la dernière série, comparé à l'objectif figé (charge et répétitions). */
export function assessLoadSession(target: DayTarget, done: ReadonlyArray<PerformedSet>): SessionOutcome | undefined {
  if (target.sets.length === 0) return undefined;
  if (done.length < target.sets.length) return { kind: "incomplete", text: `Résultat incomplet : ${done.length} série${done.length > 1 ? "s" : ""} sur ${target.sets.length}.` };
  if (done.some((set) => set.rpe === undefined)) return { kind: "incomplete", text: "Résultat à interpréter : RPE manquant sur une série." };
  const overIndex = target.rpeMax !== undefined ? done.findIndex((set) => set.rpe! > target.rpeMax!) : -1;
  if (overIndex >= 0) return { kind: "consolidate", text: `Palier à consolider : RPE ${done[overIndex]!.rpe} à la série ${overIndex + 1} (plafond ${target.rpeMax}).` };
  let delta = 0;
  let heavier = 0;
  let below = false;
  target.sets.forEach((goal, index) => {
    const set = done[index]!;
    const goalKg = goal.kg ?? 0;
    if (set.kg + EPSILON < goalKg) below = true;
    else if (set.kg > goalKg + EPSILON) heavier += 1;
    if (goal.reps !== undefined) {
      /* Répétition visée : une de moins dans le plafond suffit. */
      const required = goal.stretch ? goal.reps - 1 : goal.reps;
      if (set.reps < required && set.kg <= goalKg + EPSILON) below = true;
      else delta += Math.max(0, set.reps - goal.reps);
    }
  });
  if (below) return { kind: "consolidate", text: "Palier à consolider : objectif pas atteint sur toutes les séries." };
  const gains = [
    ...(delta > 0 ? [`+${delta} répétition${delta > 1 ? "s" : ""}`] : []),
    ...(heavier > 0 ? [`${heavier} série${heavier > 1 ? "s" : ""} au cran au-dessus`] : []),
  ];
  return gains.length > 0
    ? { kind: "exceeded", text: `Objectif dépassé : ${gains.join(", ")}, dans le plafond de RPE.` }
    : { kind: "reached", text: "Objectif atteint." };
}

/** Le retour après la dernière série d'une suspension (durées tenues) ou de négatives (répétitions). */
export function assessDurationSession(target: DayTarget, done: ReadonlyArray<PerformedSet>): SessionOutcome | undefined {
  if (target.sets.length === 0) return undefined;
  if (done.length < target.sets.length) return { kind: "incomplete", text: `Résultat incomplet : ${done.length} série${done.length > 1 ? "s" : ""} sur ${target.sets.length}.` };
  if (target.rpeMax !== undefined && done.some((set) => set.rpe !== undefined && set.rpe > target.rpeMax!)) {
    return { kind: "consolidate", text: `Palier à consolider : une série au-dessus de RPE ${target.rpeMax}.` };
  }
  let below = false;
  let above = false;
  target.sets.forEach((goal, index) => {
    const set = done[index]!;
    const byDuration = goal.durationSec !== undefined && goal.reps === undefined;
    const value = byDuration ? (set.durationSec ?? 0) : set.reps;
    const wanted = byDuration ? goal.durationSec! : (goal.reps ?? 0);
    if (value < wanted) below = true;
    else if (value > wanted) above = true;
  });
  if (below) return { kind: "consolidate", text: "Palier à consolider : objectif pas atteint sur toutes les séries." };
  return above ? { kind: "exceeded", text: "Objectif dépassé, dans le plafond de RPE." } : { kind: "reached", text: "Objectif atteint." };
}

/* -------------------------------------------------------------------------- */
/* Prévision au 31 mars (hypothèses de calcul)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Niveau estimé d'une série : charge × (1 + (répétitions + réserve) / 30),
 * réserve = 10 − RPE (0 si RPE absent). Outil interne de comparaison,
 * jamais affiché comme une force maximale. Un point de RPE mal noté vaut
 * une répétition, soit environ 3 % d'écart.
 */
export function estimatedLevel(set: PerformedSet): number {
  const reserve = set.rpe !== undefined ? Math.max(0, 10 - set.rpe) : 0;
  return set.kg * (1 + (set.reps + reserve) / 30);
}

export function sessionLevel(result: SessionResult): number {
  return Math.max(...result.sets.map(estimatedLevel));
}

/** Lundi (YYYY-MM-DD) de la semaine d'une date locale. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d + days));
  return day.toISOString().slice(0, 10);
}

/**
 * Niveau d'une séance complète (correction du 22/10/2026) : la moyenne des
 * niveaux de **toutes** ses séries. Un progrès sur la dernière série compte
 * pour sa part, ce que le niveau de la meilleure série ignorait. Sert au
 * rythme et à la comparaison avec la référence détaillée ; la faisabilité
 * d'une séance se juge, elle, série par série (`simulateLoadPlan`).
 */
export function sessionMeanLevel(result: SessionResult): number {
  return result.sets.reduce((sum, set) => sum + estimatedLevel(set), 0) / result.sets.length;
}

/** La meilleure séance de chaque semaine : plusieurs séances d'une semaine ne font qu'un point. */
export function weeklyLevels(results: ReadonlyArray<SessionResult>, levelOf: (result: SessionResult) => number = sessionLevel): Array<{ week: string; level: number }> {
  const byWeek = new Map<string, number>();
  for (const result of results) {
    const week = mondayOf(result.date);
    byWeek.set(week, Math.max(byWeek.get(week) ?? 0, levelOf(result)));
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, level]) => ({ week, level }));
}

export interface Pace {
  /** Rythme retenu, borné entre 0 et `PACE_CAP` par semaine. */
  weekly: number;
  /** Médiane brute, avant borne (pour l'explication). */
  raw?: number;
  points: number;
  provisional: boolean;
}

/** Médiane des variations hebdomadaires des 6 dernières semaines, bornée entre 0 et 1,5 %. */
export function estimatePace(points: ReadonlyArray<{ week: string; level: number }>): Pace {
  const recent = points.slice(-PACE_WINDOW);
  const rates: number[] = [];
  for (let index = 1; index < recent.length; index += 1) {
    const a = recent[index - 1]!;
    const b = recent[index]!;
    const weeks = Math.max(1, (Date.parse(b.week) - Date.parse(a.week)) / (7 * 86_400_000));
    rates.push((b.level / a.level) ** (1 / weeks) - 1);
  }
  const provisional = recent.length < PROVISIONAL_BELOW;
  if (rates.length === 0) return { weekly: 0, points: recent.length, provisional };
  const sorted = [...rates].sort((x, y) => x - y);
  const middle = sorted.length / 2;
  const raw = sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { weekly: Math.min(Math.max(raw, 0), PACE_CAP), raw, points: recent.length, provisional };
}

/**
 * Traduit un niveau estimé en charge réelle et répétitions, dans la
 * fourchette et la réserve prévues : on reste à la charge actuelle tant que
 * le haut de la fourchette n'est pas atteint, puis cran par cran (au plus
 * `maxSteps` crans au-dessus de `fromKg`). Jamais sous `fromKg`.
 */
export function shapeAt(level: number, prescription: LoadPrescription, steps: LoadSteps, fromKg: number, maxSteps = Number.POSITIVE_INFINITY): SetTarget {
  const reserve = Math.max(0, 10 - prescription.rpeMax);
  const repsAt = (kg: number) => Math.floor(30 * (level / kg - 1) - reserve + EPSILON);
  let kg = fromKg;
  let taken = 0;
  while (taken < maxSteps && repsAt(kg) >= prescription.repMax) {
    const up = nextLoadUp(steps, kg);
    if (repsAt(up) < prescription.repMin) break;
    kg = up;
    taken += 1;
  }
  return { kg, reps: Math.max(1, Math.min(repsAt(kg), prescription.repMax)) };
}

export interface ForecastInput {
  level: number;
  pace: Pace;
  /** Lundi de la première semaine projetée. */
  fromWeek: string;
  until: string;
  prescription: LoadPrescription;
  steps: LoadSteps;
  /** Charge actuelle : la prévision ne descend jamais en dessous. */
  currentKg: number;
}

/**
 * Prévision semaine par semaine jusqu'au 31 mars : le rythme ralentit de
 * 7 % par semaine ; fourchette de 40 % à 130 % du rythme ; au plus un cran
 * par semaine dans la forme probable. Pas d'extrapolation linéaire.
 */
export function forecastWeeks(input: ForecastInput): TrajectoryWeek[] {
  const weeks: TrajectoryWeek[] = [];
  let probable = input.level;
  let low = input.level;
  let high = input.level;
  let kg = input.currentKg;
  let lowKg = input.currentKg;
  let highKg = input.currentKg;
  for (let index = 0, week = input.fromWeek; week <= input.until; index += 1, week = addDays(week, 7)) {
    const factor = PACE_DECAY ** index;
    if (index > 0) {
      probable *= 1 + input.pace.weekly * factor;
      low *= 1 + input.pace.weekly * BAND_LOW * factor;
      high *= 1 + input.pace.weekly * BAND_HIGH * factor;
    }
    const shape = shapeAt(probable, input.prescription, input.steps, kg, 1);
    const lowShape = shapeAt(low, input.prescription, input.steps, lowKg, 1);
    const highShape = shapeAt(high, input.prescription, input.steps, highKg, 1);
    kg = shape.kg!;
    lowKg = lowShape.kg!;
    highKg = highShape.kg!;
    weeks.push({ week, level: round2(probable), probable: shape, low: lowShape, high: highShape });
  }
  return weeks;
}

/* -------------------------------------------------------------------------- */
/* Séances complètes semaine par semaine (correction du 22/10/2026)            */
/* -------------------------------------------------------------------------- */

/**
 * Niveau d'un objectif complet, compté au minimum accepté : chaque série au
 * plafond de RPE, la répétition visée comptée sans son +1 (refaire le
 * nombre précédent suffit). Moyenne des séries, comme `sessionMeanLevel`.
 */
export function planLevel(sets: ReadonlyArray<SetTarget>, rpeMax: number): number {
  const reserve = Math.max(0, 10 - rpeMax);
  const levels = sets.map((set) => (set.kg ?? 0) * (1 + ((set.stretch ? (set.reps ?? 1) - 1 : (set.reps ?? 0)) + reserve) / 30));
  return levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length);
}

/** Croissance cumulée de la capacité, semaine `index` (0 = semaine de départ) : même rythme ralenti que la prévision. */
function growthAt(pace: number, index: number): number {
  let growth = 1;
  for (let step = 1; step <= index; step += 1) growth *= 1 + pace * PACE_DECAY ** step;
  return growth;
}

/** En dessous de 3 semaines avec séance, le rythme est **inconnu** (pas nul) : seule la prochaine séance est donnée. */
export const PACE_KNOWN_FROM = 3;
/** Séances comparables retenues pour le point de départ et le profil d'effort. */
export const START_WINDOW = 5;

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Niveau d'une série pour la **tendance** seulement : RPE absent compté au
 * plafond (hypothèse prudente, ni réserve inventée). Jamais utilisé par les
 * règles de l'objectif, où un RPE absent empêche toute validation.
 */
const levelAtCap = (set: PerformedSet, rpeMax: number) => estimatedLevel(set.rpe === undefined ? { ...set, rpe: rpeMax } : set);

export interface PlanStart {
  /** Niveau moyen de départ d'une séance complète. */
  level: number;
  /** Part de chaque série dans ce niveau (moyenne 1), jamais croissante d'une série à la suivante. */
  profile: number[];
  /** Séances utilisées. */
  sessions: number;
}

/**
 * Point de départ de la projection, sur **plusieurs** séances comparables
 * (jusqu'à 5), pas sur la seule dernière :
 * - **niveau** : droite robuste (Theil-Sen : médiane des pentes entre
 *   séances, puis médiane des ordonnées) évaluée à la date de la dernière
 *   séance. Elle suit une vraie progression sans retard, et une séance
 *   isolée ou un RPE mal noté ne la tire pas à lui seul (à partir de
 *   4 séances ; avec 3, l'effet est limité). Moins de 3 séances : la
 *   dernière.
 * - **profil d'effort** : pour chaque rang de série, la médiane de sa part
 *   dans le niveau de la séance ; une série ne peut pas être plus forte que
 *   la précédente (une dernière série exceptionnelle n'est pas une
 *   caractéristique permanente), puis moyenne ramenée à 1.
 */
export function estimatePlanStart(history: ReadonlyArray<SessionResult>, sets: number, rpeMax: number): PlanStart {
  const recent = history.slice(-START_WINDOW).filter((result) => result.sets.length > 0);
  const t0 = Date.parse(recent[0]!.date);
  const points = recent.map((result) => {
    const levels = result.sets.map((set) => levelAtCap(set, rpeMax));
    const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
    return { x: (Date.parse(result.date) - t0) / (7 * 86_400_000), y: mean, shares: levels.map((value) => value / mean) };
  });
  let level = points.at(-1)!.y;
  if (points.length >= 3) {
    const slopes: number[] = [];
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        if (points[b]!.x > points[a]!.x + EPSILON) slopes.push((points[b]!.y - points[a]!.y) / (points[b]!.x - points[a]!.x));
      }
    }
    if (slopes.length > 0) {
      const slope = median(slopes);
      const intercept = median(points.map((point) => point.y - slope * point.x));
      level = intercept + slope * points.at(-1)!.x;
    }
  }
  const profile: number[] = [];
  for (let index = 0; index < sets; index += 1) {
    const shares = points.flatMap((point) => (point.shares[index] !== undefined ? [point.shares[index]!] : []));
    const share = shares.length > 0 ? median(shares) : (profile.at(-1) ?? 1);
    profile.push(index === 0 ? share : Math.min(share, profile[index - 1]!));
  }
  const mean = profile.reduce((sum, value) => sum + value, 0) / profile.length;
  return { level, profile: profile.map((value) => value / mean), sessions: points.length };
}

export interface LoadPlanInput {
  /** Séances comparables (la dernière comprise), de la plus ancienne à la plus récente. */
  history: ReadonlyArray<SessionResult>;
  prescription: LoadPrescription;
  steps: LoadSteps;
  /** Rythme hebdomadaire retenu (déjà multiplié pour la fourchette basse ou haute). */
  pace: number;
  fromWeek: string;
  until: string;
  /** Objectif réel de la première semaine (règles, groupe partagé compris) ; sinon recalculé. */
  first?: DayTarget | undefined;
}

/**
 * Les objectifs complets, série par série, semaine après semaine :
 * - **semaine de départ** : l'objectif des règles sur ta dernière séance
 *   réelle — proposé tel quel, le rythme ne le freine jamais ;
 * - **semaines suivantes** : les mêmes règles appliquées à la séance
 *   simulée de la semaine d'avant.
 *
 * Validation **interne** (jamais présentée comme un résultat) : une séance
 * est simulée avec, pour chaque série, la capacité « niveau de départ ×
 * part de cette série × croissance du rythme », jamais en dessous de ce que
 * cette série a déjà fait dans la simulation. Une série fait les
 * répétitions visées si sa capacité le permet au plafond de RPE, sinon ce
 * qu'elle peut. L'objectif n'est jugé **réalisable** que si chaque série,
 * prise seule, atteint son minimum (la répétition visée : refaire le nombre
 * précédent suffit). Réalisable, la séance simulée nourrit l'objectif
 * suivant : la répétition visée reste visée tant que la capacité de cette
 * série ne permet pas le +1 entier, puis le +1 entier est compté — jamais
 * indéfiniment au minimum tant que le rythme est positif. Pas réalisable,
 * le même objectif est repris la semaine suivante.
 */
export function simulateLoadPlan(input: LoadPlanInput): PlanWeek[] {
  const p = input.prescription;
  const reserve = Math.max(0, 10 - p.rpeMax);
  const start = estimatePlanStart(input.history, p.sets, p.rpeMax);
  const last = input.history.at(-1)!;
  /* Ce que chaque série a déjà fait dans la simulation : sa capacité ne redescend jamais en dessous. */
  const floor = start.profile.map(() => 0);
  const weeks: PlanWeek[] = [];
  /*
   * Les règles voient la séance réelle telle qu'elle a été notée : un RPE
   * absent ne valide jamais un palier ni une hausse (objectif « à
   * consolider »). Le RPE absent compté au plafond ne sert qu'à estimer la
   * tendance (`estimatePlanStart`).
   */
  let state: SessionResult = last;
  for (let index = 0, week = input.fromWeek; week <= input.until; index += 1, week = addDays(week, 7)) {
    const target = index === 0 && input.first ? input.first : nextLoadTarget({ prescription: p, steps: input.steps, last: state, now: "" });
    const growth = growthAt(input.pace, index);
    const done = target.sets.map((set, position) => {
      const kg = set.kg ?? 0;
      const goal = set.reps ?? 0;
      const minimum = set.stretch ? goal - 1 : goal;
      const own = Math.max(start.level * (start.profile[position] ?? start.profile.at(-1)!) * growth, floor[position] ?? 0);
      const possible = kg > 0 ? Math.floor(30 * (own / kg - 1) - reserve + EPSILON) : goal + 1;
      const reps = Math.min(goal, possible);
      return { kg, reps, rpe: possible - reps >= 1 ? p.rpeMax - 1 : p.rpeMax, ok: reps >= minimum };
    });
    const feasible = done.length > 0 && done.every((set) => set.ok);
    weeks.push({
      week,
      sets: target.sets.map((set) => ({ ...set })),
      kind: target.kind,
      level: round2(planLevel(target.sets, p.rpeMax)),
      feasible,
      /* Séance simulée (validation interne), avec le cran de chaque série pendant une transition. */
      ...(feasible ? { done: done.map(({ kg, reps }, position): SetTarget => ({ kg, reps, ...(target.sets[position]?.step ? { step: target.sets[position]!.step } : {}) })) } : {}),
    });
    if (feasible) {
      state = { workoutId: "simulation", date: week, sets: done.map(({ kg, reps, rpe }) => ({ kg, reps, rpe })) };
      done.forEach((set, position) => {
        floor[position] = Math.max(floor[position] ?? 0, estimatedLevel(set));
      });
    }
  }
  return weeks;
}

/** Suspension : mêmes règles série par série, chaque série supposée tenue avec de la réserve (+2 s par semaine, jusqu'au haut de la consigne). */
export function simulateDurationPlan(input: { last: SessionResult; prescription: DurationPrescription; fromWeek: string; until: string; first?: DayTarget | undefined }): PlanWeek[] {
  const p = input.prescription;
  const weeks: PlanWeek[] = [];
  let state = input.last;
  for (let index = 0, week = input.fromWeek; week <= input.until; index += 1, week = addDays(week, 7)) {
    const target = index === 0 && input.first ? input.first : nextDurationTarget(p, state, "");
    const sets = target.sets.map((set) => ({ ...set }));
    const level = sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0) / Math.max(1, sets.length);
    weeks.push({ week, sets, kind: target.kind, level: round2(level), feasible: sets.length > 0, ...(sets.length > 0 ? { done: sets.map((set) => ({ ...set })) } : {}) });
    if (sets.length > 0) state = { workoutId: "simulation", date: week, sets: sets.map((set) => ({ kg: 0, reps: 0, durationSec: set.durationSec ?? 0, rpe: p.rpeMax - 1 })) };
  }
  return weeks;
}

/** Niveau d'une durée réelle : moyenne des durées tenues (comparable au `level` d'une semaine de suspension). */
export function sessionMeanDuration(result: SessionResult): number {
  return result.sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0) / Math.max(1, result.sets.length);
}

/* -------------------------------------------------------------------------- */
/* Statut d'une semaine                                                        */
/* -------------------------------------------------------------------------- */

export type WeekStatus = "ahead" | "on_track" | "consolidate" | "missed" | "insufficient" | "suspended" | "upcoming";

/**
 * Statut d'une semaine par rapport à la trajectoire initiale. Une semaine
 * à venir n'est jamais présentée comme réussie ou échouée.
 */
export function weekStatus(input: { week: string; today: string; initialLevel?: number | undefined; actualLevel?: number | undefined; suspended?: boolean }): WeekStatus {
  if (input.week > mondayOf(input.today)) return "upcoming";
  if (input.suspended) return "suspended";
  if (input.actualLevel === undefined) return input.week === mondayOf(input.today) ? "upcoming" : "missed";
  if (input.initialLevel === undefined) return "insufficient";
  const gap = input.actualLevel / input.initialLevel - 1;
  if (gap > ON_TRACK_TOLERANCE) return "ahead";
  if (gap >= -ON_TRACK_TOLERANCE) return "on_track";
  return "consolidate";
}
