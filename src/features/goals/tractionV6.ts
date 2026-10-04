import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { WeightEntry, WorkoutSession } from "../../domain";
import { getWeekStartDate } from "../../domain/rules/programRules";
import { betSessions, type BetSession, type BetSet } from "./tractionBet";

/**
 * Pari traction — **V6, spécification finale figée** (04/10/2026) : 1
 * traction stricte au plus tard le 31/03/2027.
 *
 * Deux états distincts :
 * - la **référence V6** (`V6_REFERENCE`) : fixe, jamais décalée ni recalculée ;
 * - le **réel** (`v6State`) : reconstruit à chaque fois depuis les séances
 *   de force faites — palier A courant, phase, replis, régressions.
 *
 * Invariants (§ 24) :
 * 1. la référence reste fixe ; 2. le réel est adaptatif ; 3. seul 5/5/5 en
 * séance A valide un palier ; 4. un test mesure mais ne valide jamais A ;
 * 5. une validation change A immédiatement ; 6. toute séance A peut
 * déclencher un repli ; 7. un repli ne change pas A ; 8. un repli est exclu
 * des régressions ; 9. les reps ne se comparent qu'à aide identique ;
 * 10. B = le palier de volume du dernier palier A validé (il ne descend
 * pas avec A : 35 validé → B 42 ; 28 → 35 ; 21 → 28 ; 14 → 21 ; 7 → 14) ; 11. 7 = 5/5/5 → phase essai libre,
 * jamais « A = 0 × 3 séries » ; 12. une réussite à 0 kg termine l'objectif.
 *
 * Rien n'est stocké : tout se recalcule depuis les séances, les tests et
 * les pesées.
 */

export const V6_START_DATE = "2026-10-04";
export const V6_DEADLINE = "2027-03-31";
export const V6_START_KG = 35;
/** Muscu B tant qu'aucun palier A n'est validé ; ensuite : `v6VolumeKgAfter`. */
export const V6_START_B_KG = 42;

/**
 * Règle B (source unique, 05/10/2026) : l'aide de Muscu B après la
 * validation du palier A `validatedKg` — un cran au-dessus du palier
 * validé : 35 → 42, 28 → 35, 21 → 28, 14 → 21, 7 → 14.
 */
export function v6VolumeKgAfter(validatedKg: number): number {
  return validatedKg + V6_STEP_KG;
}
/** Les crans de la machine. */
export const V6_STEP_KG = 7;
export const V6_VALIDATION_REPS = 5;
export const V6_MAX_RPE = 9;
export const V6_REST_SEC = 180;

/* -------------------------------------------------------------------------- */
/* Référence V6 (§ 12) : fixe                                                 */
/* -------------------------------------------------------------------------- */

export type V6WeekKind = "force" | "test" | "essai";

export interface V6Week {
  /** S1 … S26 */
  number: number;
  /** Dimanche. */
  date: string;
  weightKg: number;
  kind: V6WeekKind;
  /**
   * Palier de référence de la semaine (§ 16) : celui que la référence
   * travaille ce dimanche-là ; en semaine test, le palier en cours ;
   * S25-S26 : 7 kg (phase essai libre).
   */
  refKg: number;
  /** Colonne « Dimanche A / Test ». */
  a: string;
  /**
   * Reps de référence du dimanche de force (plancher « réf ≥ », ou la
   * cible 5/5/5) ; absentes en semaine test et en essai libre.
   */
  refReps?: readonly number[];
  /** Colonne « Mardi B ». */
  b: string;
  /** Colonne « Jeudi C ». */
  c: string;
}

const w = (number: number, date: string, weightKg: number, kind: V6WeekKind, refKg: number, a: string, b: string, c: string): V6Week => ({
  number, date, weightKg, kind, refKg, a, b, c,
});

/**
 * Référence recalée le 04/10/2026 sur le premier vrai résultat V6 (35 kg
 * validé en 5/5/5 dès S1) : recalage manuel exceptionnel, la référence
 * reste ensuite figée. Le palier de référence d'une semaine est celui que
 * la référence travaille ce dimanche-là (S1 : 35, validé ; une semaine
 * test : le palier en cours) ; la colonne C reprend le programme C.
 * Colonne B : la règle B (`v6VolumeKgAfter`) appliquée aux validations
 * prévues (35 en S1, 28 en S6, 21 en S11, 14 en S17, 7 en S23) — dès le
 * mardi de la semaine de validation ; une semaine test ne change que le
 * volume (2 × 8). Corrigé le 05/10 : S6, S11, S12, S17, S23.
 */
const RAW_REFERENCE: readonly V6Week[] = [
  w(1, "2026-10-04", 92, "force", 35, "35 validé 5/5/5+", "42 — 3×8–10", "Normal + scap/grip"),
  w(2, "2026-10-11", 91, "force", 28, "28 ≥3/3/3", "42 — 3×8–10", "Normal"),
  w(3, "2026-10-18", 90, "force", 28, "28 ≥4/3/3", "42 — 3×8–10", "Normal"),
  w(4, "2026-10-25", 89, "test", 28, "TEST #1", "42 — 2×8", "−50 %"),
  w(5, "2026-11-01", 88, "force", 28, "28 ≥4/4/4", "42 — 3×8–10", "+ négatives 2×2"),
  w(6, "2026-11-08", 87, "force", 28, "28 objectif 5/5/5", "35 — 3×8–10", "+ négatives"),
  w(7, "2026-11-15", 86, "force", 21, "21 ≥3/3/3", "35 — 3×8–10", "+ négatives"),
  w(8, "2026-11-22", 85, "test", 21, "TEST #2", "35 — 2×8", "−50 %"),
  w(9, "2026-11-29", 84, "force", 21, "21 ≥4/3/3", "35 — 3×8–10", "+ négatives"),
  w(10, "2026-12-06", 83, "force", 21, "21 ≥4/4/4", "35 — 3×8–10", "+ négatives"),
  w(11, "2026-12-13", 82, "force", 21, "21 objectif 5/5/5", "28 — 3×8–10", "+ négatives"),
  w(12, "2026-12-20", 81, "test", 14, "TEST #3", "28 — 2×8", "−50 %"),
  w(13, "2026-12-27", 80, "force", 14, "14 ≥3/3/3", "28 — 3×8–10", "+ négatives"),
  w(14, "2027-01-03", 79, "force", 14, "14 ≥4/3/3", "28 — 3×8–10", "+ négatives"),
  w(15, "2027-01-10", 78, "force", 14, "14 ≥4/4/4", "28 — 3×8–10", "+ négatives"),
  w(16, "2027-01-17", 77, "test", 14, "TEST #4", "28 — 2×8", "−50 %"),
  w(17, "2027-01-24", 76, "force", 14, "14 objectif 5/5/5", "21 — 3×8–10", "+ négatives"),
  w(18, "2027-01-31", 75, "force", 7, "7 ≥2–3/2–3/2", "21 — 3×8–10", "+ négatives"),
  w(19, "2027-02-07", 75, "force", 7, "7 ≥3/3/3", "21 — 3×8–10", "+ négatives"),
  w(20, "2027-02-14", 75, "test", 7, "TEST #5", "21 — 2×8", "−50 %"),
  w(21, "2027-02-21", 75, "force", 7, "7 ≥4/3/3", "21 — 3×8–10", "+ négatives"),
  w(22, "2027-02-28", 75, "force", 7, "7 ≥4/4/4", "21 — 3×8–10", "+ négatives"),
  w(23, "2027-03-07", 75, "force", 7, "7 objectif 5/5/5", "14 — 3×8–10", "léger"),
  w(24, "2027-03-14", 75, "test", 7, "TEST #6, 0 possible", "14 — 2×8", "−50 %"),
  w(25, "2027-03-21", 75, "essai", 7, "essai libre 0 kg", "14 léger", "récupération"),
  w(26, "2027-03-28", 75, "essai", 7, "essai libre 0 kg", "très léger", "repos"),
];

/** Les reps de référence, lues dans la colonne A ; S18 « ≥ 2–3 / 2–3 / 2 » : le plancher 2 / 2 / 2. */
const REF_REPS: Readonly<Record<number, readonly number[]>> = {
  1: [5, 5, 5], 2: [3, 3, 3], 3: [4, 3, 3], 5: [4, 4, 4], 6: [5, 5, 5],
  7: [3, 3, 3], 9: [4, 3, 3], 10: [4, 4, 4], 11: [5, 5, 5],
  13: [3, 3, 3], 14: [4, 3, 3], 15: [4, 4, 4], 17: [5, 5, 5],
  18: [2, 2, 2], 19: [3, 3, 3], 21: [4, 3, 3], 22: [4, 4, 4], 23: [5, 5, 5],
};

export const V6_REFERENCE: readonly V6Week[] = RAW_REFERENCE.map((week) => {
  const refReps = REF_REPS[week.number];
  return refReps ? { ...week, refReps } : week;
});

/** La semaine de référence de `date` (dimanche → samedi) ; avant S1 : S1 ; après S26 : S26. */
export function v6WeekOf(date: string): V6Week {
  const sunday = getWeekStartDate(date);
  if (sunday < V6_REFERENCE[0]!.date) return V6_REFERENCE[0]!;
  return V6_REFERENCE.find((week) => week.date === sunday) ?? V6_REFERENCE.at(-1)!;
}

/* -------------------------------------------------------------------------- */
/* Réel : palier A courant, reconstruit depuis les séances de force (§ 4-8)   */
/* -------------------------------------------------------------------------- */

export type V6Phase = "travail" | "essai_libre" | "gagne";

/** Un résultat de test, tel que le moteur le lit. */
export interface V6TestResultLike {
  id: string;
  protocolId: string;
  date: string;
  workoutId?: string;
  measures: ReadonlyArray<{ key: string; value: number }>;
}

export type V6EventKind = "validation" | "repli" | "regression" | "victoire" | "essai_echoue";

export interface V6Event {
  kind: V6EventKind;
  date: string;
  workoutId: string;
  /** Le palier A au moment de la séance. */
  aKg: number;
  /** Validation : le palier validé ; régression : reps totales avant → après. */
  detail?: string;
}

export interface V6State {
  /** Palier A courant réel (en phase essai libre : 7, le back-off). */
  aKg: number;
  phase: V6Phase;
  /**
   * Muscu B : le palier de volume associé au dernier palier A validé — le
   * palier validé + 7 kg ; 42 kg tant que rien n'est validé. B ne descend
   * pas avec A : 35 validé → A 28, B 42 ; 28 → A 21, B 35 ; … ; 7 → phase
   * essai libre, B 14. Source unique de l'aide de Muscu B.
   */
  bKg: number;
  events: V6Event[];
  /** Régressions consécutives au même palier (repli et tests exclus). */
  consecutiveRegressions: number;
  /** Dernière séance de force prise en compte. */
  last?: BetSession;
}

const repsAt = (sets: readonly BetSet[], kg: number) => sets.filter((set) => set.assistKg === kg);

/** 5/5/5 : au moins trois séries à cette aide, chacune à 5 répétitions ou plus. */
function fiveFiveFive(sets: readonly BetSet[], kg: number): boolean {
  const at = repsAt(sets, kg);
  return at.length >= 3 && at.slice(0, 3).every((set) => set.reps >= V6_VALIDATION_REPS);
}

/** Repli (§ 5) : la première série au palier A à 2 répétitions ou moins, ou à RPE 10. */
export function isRepli(sets: readonly BetSet[], aKg: number): boolean {
  const first = sets.find((set) => set.assistKg === aKg);
  if (!first) return false;
  return first.reps <= 2 || first.rpe === 10;
}

/**
 * Le réel, séance de force après séance de force (les jours de test, à 2
 * séries, sont déjà exclus par `betSessions`) :
 * - une traction réussie à 0 kg → objectif gagné (§ 21) ;
 * - phase essai libre : la 1ʳᵉ série à 0 kg échouée → l'essai est noté,
 *   on reste en phase essai libre ;
 * - 5/5/5 à une aide ≤ A → ce palier est validé, A = palier − 7
 *   immédiatement ; 7 validé → phase essai libre (§ 4) ;
 * - sinon, repli (§ 5) : noté, A inchangé, exclu des régressions ;
 * - sinon, régression (§ 17) : moins de reps totales au palier A que la
 *   précédente séance valide à ce même palier.
 *
 * Les tests (`results`) ne changent jamais A et n'entrent pas dans les
 * régressions ; seule exception (§ 21) : une traction stricte réussie à
 * 0 kg pendant un test = objectif gagné, à la date du test.
 */
export function v6State(workouts: readonly WorkoutSession[], until: string, results: readonly V6TestResultLike[] = []): V6State {
  const testWin = results
    .filter((result) => result.protocolId === "protocol-traction" && result.date >= V6_START_DATE && result.date <= until)
    .filter((result) => result.measures.some((measure) => measure.key === "assistance_min_kg" && measure.value === 0))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const sessions = betSessions(workouts).filter(
    (session) => session.date >= V6_START_DATE && session.date <= until && (testWin === undefined || session.date <= testWin.date),
  );
  const events: V6Event[] = [];
  let aKg = V6_START_KG;
  let bKg = V6_START_B_KG;
  let phase: V6Phase = "travail";
  let consecutiveRegressions = 0;
  /* Reps totales de la dernière séance valide, par palier (§ 17). */
  const lastTotalAt = new Map<number, number>();

  for (const session of sessions) {
    if (phase === "gagne") break;
    const { sets } = session;
    const base = { date: session.date, workoutId: session.workoutId, aKg };

    if (sets.some((set) => set.assistKg === 0 && set.reps >= 1)) {
      events.push({ ...base, kind: "victoire" });
      phase = "gagne";
      continue;
    }
    if (phase === "essai_libre") {
      if (sets.some((set) => set.assistKg === 0)) events.push({ ...base, kind: "essai_echoue" });
      continue;
    }

    /* Validation : le palier le plus assisté… le moins assisté réussi en 5/5/5, à A ou mieux. */
    const validated = [...new Set(sets.map((set) => set.assistKg))]
      .filter((kg) => kg <= aKg && kg > 0 && fiveFiveFive(sets, kg))
      .sort((a, b) => a - b)[0];
    if (validated !== undefined) {
      events.push({ ...base, kind: "validation", detail: `${validated} kg` });
      consecutiveRegressions = 0;
      bKg = v6VolumeKgAfter(validated);
      if (validated <= V6_STEP_KG) {
        phase = "essai_libre";
        aKg = V6_STEP_KG;
      } else {
        aKg = validated - V6_STEP_KG;
      }
      continue;
    }

    if (isRepli(sets, aKg)) {
      events.push({ ...base, kind: "repli" });
      continue;
    }

    const at = repsAt(sets, aKg);
    if (at.length === 0) continue;
    const total = at.reduce((sum, set) => sum + set.reps, 0);
    const previous = lastTotalAt.get(aKg);
    if (previous !== undefined && total < previous) {
      consecutiveRegressions += 1;
      events.push({ ...base, kind: "regression", detail: `${previous} → ${total} reps` });
    } else {
      consecutiveRegressions = 0;
    }
    lastTotalAt.set(aKg, total);
  }

  if (testWin && phase !== "gagne") {
    events.push({ kind: "victoire", date: testWin.date, workoutId: testWin.workoutId ?? testWin.id, aKg, detail: "test à 0 kg" });
    phase = "gagne";
  }

  const last = sessions.at(-1);
  return {
    aKg,
    phase,
    bKg,
    events,
    consecutiveRegressions,
    ...(last ? { last } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Prescriptions (§ 3, § 5, § 6, § 10, § 20)                                  */
/* -------------------------------------------------------------------------- */

export interface V6ForceSession {
  /** Séries prévues : aide et nombre MAXIMAL de répétitions propres. */
  sets: BetSet[];
  restSec: number;
  /** Lignes du bandeau. */
  lines: string[];
}

/** Dimanche de force : 3 séries jusqu'à 5 ; phase essai libre : 0 kg d'abord, puis back-off à 7. */
export function v6ForceSession(state: V6State): V6ForceSession {
  if (state.phase === "gagne") return { sets: [], restSec: V6_REST_SEC, lines: ["Objectif gagné : 1 traction stricte."] };
  if (state.phase === "essai_libre") {
    return {
      sets: [{ assistKg: 0, reps: 1 }, { assistKg: V6_STEP_KG, reps: V6_VALIDATION_REPS }, { assistKg: V6_STEP_KG, reps: V6_VALIDATION_REPS }],
      restSec: V6_REST_SEC,
      lines: [
        "Essai libre à 0 kg en tout premier, frais.",
        "Réussi : objectif gagné.",
        `Échec : séries de travail à ${V6_STEP_KG} kg, jusqu'à ${V6_VALIDATION_REPS} reps propres.`,
      ],
    };
  }
  const a = state.aKg;
  return {
    sets: [0, 1, 2].map(() => ({ assistKg: a, reps: V6_VALIDATION_REPS })),
    restSec: V6_REST_SEC,
    lines: [
      `3 séries à ${a} kg : jusqu'à ${V6_VALIDATION_REPS} reps propres chacune, RPE ${V6_MAX_RPE} au plus, 3 min de repos.`,
      `Ne pas s'arrêter à 3 ou 4 si une répétition propre de plus est possible.`,
      `Repli : si la 1ʳᵉ série donne 2 reps ou moins, ou RPE 10 → séries 2 et 3 à ${a + V6_STEP_KG} kg. Le palier reste ${a} kg.`,
      `5/5/5 à ${a} kg : palier validé, ${a === V6_STEP_KG ? "phase essai libre" : `A passe à ${a - V6_STEP_KG} kg`} immédiatement.`,
    ],
  };
}

/**
 * Mardi B : un cran plus assisté que A ; 3 × 8-10 (semaine test : 2 × 8),
 * RPE 6-8, jamais à l'échec. Préremplissage au bas de la plage : 8.
 */
export function v6LightSession(state: V6State, date: string): { assistKg: number; sets: BetSet[]; label: string } {
  const test = v6WeekOf(date).kind === "test";
  const count = test ? 2 : 3;
  return {
    assistKg: state.bKg,
    sets: Array.from({ length: count }, () => ({ assistKg: state.bKg, reps: 8 })),
    label: test ? `${state.bKg} kg — 2 × 8, RPE 6-8 (semaine test)` : `${state.bKg} kg — 3 × 8-10, RPE 6-8, jamais à l'échec`,
  };
}

/** Les briques traction du programme V2. */
export const V6_FORCE_BLOCK_ID = "v2-muscu-a-traction";
export const V6_LIGHT_BLOCK_ID = "v2-muscu-b-traction";
export const V6_LIGHT_TEMPLATE_ID = "v2-muscu-b";

/** Muscu C : les tractions négatives, à partir du 01/11/2026 (§ 11). */
export const V6_NEGATIVES_BLOCK_ID = "v2-muscu-c-negatives";
export const V6_NEGATIVES_START = "2026-11-01";
/** Cardio C du samedi avant un test : le 2e bloc soutenu de 12 min et la récupération qui le précède sortent. */
export const V6_CARDIO_C_DELOAD_STEP_IDS = ["v2-cardio-c-entre", "v2-cardio-c-soutenu-2"];

interface AdjustableTemplate {
  id: string;
  blocks: ReadonlyArray<{ id: string; kind: string; role?: "warmup"; instructions?: { shape: string; sets?: number }; rounds?: number }>;
}

export interface V6Adjustment {
  blockId: string;
  sets?: number;
  rounds?: number;
  removeStepIds?: string[];
  remove?: true;
}

/**
 * Allègement au démarrage d'une séance (§ 9 et § 11), décidé par la date :
 * - Muscu B en semaine test : la traction à 2 séries (2 × 8) ;
 * - Muscu C en semaine test (−50 %) : 3 séries → 2, 2 → 1 (la moitié,
 *   arrondie au-dessus), « Rester bas » 3 tours → 2 ; l'échauffement ne
 *   bouge pas ;
 * - Muscu C avant le 01/11 : pas de tractions négatives ;
 * - Cardio C du samedi avant un dimanche de test : sans le 2e bloc
 *   soutenu de 12 min ni la récupération qui le précède (≈ 42 min).
 */
export function v6SnapshotAdjustments(template: AdjustableTemplate, date: string): V6Adjustment[] {
  if (date < V6_START_DATE) return [];
  const testWeek = v6WeekOf(date).kind === "test" && getWeekStartDate(date) >= V6_START_DATE;

  if (template.id === V6_LIGHT_TEMPLATE_ID) return testWeek ? [{ blockId: V6_LIGHT_BLOCK_ID, sets: 2 }] : [];

  if (template.id === "v2-muscu-c") {
    const adjustments: V6Adjustment[] = [];
    for (const block of template.blocks) {
      if (block.id === V6_NEGATIVES_BLOCK_ID && date < V6_NEGATIVES_START) {
        adjustments.push({ blockId: block.id, remove: true });
        continue;
      }
      if (!testWeek || block.role === "warmup") continue;
      if (block.kind === "group" && block.rounds !== undefined && block.rounds > 1) adjustments.push({ blockId: block.id, rounds: Math.ceil(block.rounds / 2) });
      const sets = block.instructions?.sets;
      if (block.kind === "exercise" && sets !== undefined && sets > 1) adjustments.push({ blockId: block.id, sets: Math.ceil(sets / 2) });
    }
    return adjustments;
  }

  if (template.id === "v2-cardio-c") {
    const tomorrow = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
    const beforeTest = v6WeekOf(tomorrow).kind === "test" && getWeekStartDate(tomorrow) === tomorrow;
    return beforeTest ? [{ blockId: "v2-cardio-c-tapis", removeStepIds: [...V6_CARDIO_C_DELOAD_STEP_IDS] }] : [];
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* Couleur (§ 15), charge effective (§ 18), garde-fou (§ 17), essai (§ 19)    */
/* -------------------------------------------------------------------------- */

export type V6Color = "vert" | "orange" | "rouge" | "gagne";

/**
 * Palier A réel ↔ palier de référence de la semaine : égal ou moins
 * assisté → vert ; un cran plus assisté → orange ; deux ou plus → rouge.
 * Les reps ne changent pas la couleur ; jamais d'écart en semaines.
 */
export function v6Color(state: V6State, date: string): V6Color {
  if (state.phase === "gagne") return "gagne";
  const ref = v6WeekOf(date).refKg;
  const crans = (state.aKg - ref) / V6_STEP_KG;
  if (crans <= 0) return "vert";
  if (crans === 1) return "orange";
  return "rouge";
}

/**
 * L'état à comparer à la référence de la semaine de `date` : le palier A
 * du **début** de la semaine (avant son dimanche de force). Ainsi S1, où
 * la référence valide 35 kg, reste « conforme » après la validation de
 * 35 ; une validation dans la semaine prévue reste conforme, un retard se
 * voit la semaine suivante. Une victoire compte tout de suite.
 */
export function v6StatusState(workouts: readonly WorkoutSession[], date: string, results: readonly V6TestResultLike[] = []): V6State {
  const now = v6State(workouts, date, results);
  if (now.phase === "gagne") return now;
  return v6State(workouts, format(addDays(parseISO(getWeekStartDate(date)), -1), "yyyy-MM-dd"), results);
}

/** Le poids connu le plus récent à `date`. */
export function weightAt(weights: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>, date: string): number | undefined {
  return [...weights].filter((entry) => entry.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg;
}

/** Charge effective indicative = poids − assistance (§ 18) : une tendance, pas une mesure biomécanique. */
export function effectiveLoad(weightKg: number | undefined, assistKg: number): number | undefined {
  return weightKg === undefined ? undefined : Math.round((weightKg - assistKg) * 10) / 10;
}

/**
 * Garde-fou (§ 17) : deux régressions consécutives au même palier pendant
 * que le poids baisse → message ; sinon rien.
 */
export function v6WeightGuard(state: V6State, weights: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>): string | undefined {
  if (state.consecutiveRegressions < 2) return undefined;
  const regressions = state.events.filter((event) => event.kind === "regression").slice(-2);
  const before = weightAt(weights, regressions[0]!.date);
  const after = weightAt(weights, regressions[1]!.date);
  if (before === undefined || after === undefined || after >= before) return undefined;
  return "Performance en baisse pendant la perte de poids — réévaluer le rythme du déficit.";
}

/**
 * Essai libre anticipé (§ 19), avant la validation de 7 : environ 5 reps
 * propres à une charge effective ≥ 90 % du poids réel → recommandation.
 */
export function v6EarlyFreeTry(state: V6State, weights: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>): string | undefined {
  if (state.phase !== "travail" || !state.last) return undefined;
  const weight = weightAt(weights, state.last.date);
  if (weight === undefined) return undefined;
  const good = state.last.sets.find((set) => set.reps >= V6_VALIDATION_REPS && set.assistKg > 0 && (weight - set.assistKg) / weight >= 0.9);
  return good ? "Essai traction libre recommandé au prochain dimanche de force, frais, avant les séries." : undefined;
}

/** Semaines restantes jusqu'au 31/03 (affichage seul : pas un écart). */
export function weeksUntilDeadline(today: string): number {
  return Math.max(0, Math.ceil(differenceInCalendarDays(parseISO(V6_DEADLINE), parseISO(today)) / 7));
}
