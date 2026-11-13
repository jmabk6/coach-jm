import type { PerformedExerciseBlock, PerformedSeries, PerformedSeriesRole, WorkoutSession } from "../../domain";
import { isWorkSeries } from "../../domain/rules/strengthRules";
import { BET_EXERCISE_ID, BET_FORCE_TEMPLATES, formatBetSets, type BetSet } from "../goals/tractionBet";
import {
  isRepli, v6LightTemplateIdAt, V6_MAX_RPE, V6_STEP_KG, V6_VALIDATION_REPS, v6Color, v6ForceSession, v6LightSession, v6VolumeKgAfter, type V6Color, type V6State,
} from "../goals/tractionV6";
import { v6StatusLabel } from "../goals/tractionV6View";
import { TRACTION_TEST_V4_COMPLEMENT } from "../tests/seedTractionTestV4";
import type { BetBanner } from "./ExerciseBlockCard";

/**
 * Le bandeau du pari traction V6 dans la séance (04/10/2026) :
 * - Muscu A : le palier A réel (moteur V6), le statut par rapport à la
 *   référence, la consigne, la règle de repli, ce qui valide. Un repli
 *   saisi en série 1 bascule aussitôt les séries 2 et 3 un cran plus haut ;
 * - jour de test : le test traction V4 (25/10/2026), puis 2 séries de
 *   complément à palier A + 7 kg, sans effet sur le palier ;
 * - Muscu B : le palier de volume du dernier palier A validé (`state.bKg`),
 *   3 × 8-10 (2 × 8 en semaine test).
 * Ailleurs : rien.
 */

const TONES: Record<V6Color, string> = { vert: "on_track", orange: "watch", rouge: "late", gagne: "reached" };

function statusOf(state: V6State, date: string): { label: string; tone: string } {
  return { label: v6StatusLabel(state, date), tone: TONES[v6Color(state, date)] };
}

function lastLine(state: V6State): string {
  const last = state.last;
  if (!last) return "—";
  const reps = last.sets.map((set) => set.reps).join(" / ");
  const rpe = last.sets.some((set) => set.rpe !== undefined) ? ` — RPE ${last.sets.map((set) => set.rpe ?? "—").join(" / ")}` : "";
  const loads = new Set(last.sets.map((set) => set.assistKg)).size > 1 ? ` (${formatBetSets(last.sets)})` : "";
  return `${reps}${rpe}${loads}`;
}

/**
 * Échauffement des tractions (L1, 02/11/2026) : 3 séries progressives avant
 * le travail, au-dessus du palier du jour (A + 21, + 14, + 7 kg d'aide).
 * Notées « Échauffement », elles n'entrent dans aucun calcul du pari.
 */
export const TRACTION_WARMUP: ReadonlyArray<{ offsetKg: number; reps: number }> = [
  { offsetKg: 21, reps: 6 },
  { offsetKg: 14, reps: 4 },
  { offsetKg: 7, reps: 2 },
];

/** Séries de travail déjà validées de la brique, à l'aide saisie (l'échauffement n'en fait pas partie). */
function doneSets(block: PerformedExerciseBlock): BetSet[] {
  return [...(block.series ?? [])]
    .sort((a, b) => a.position - b.position)
    .filter((series) => series.status === "completed" && isWorkSeries(series) && series.load?.kind === "total" && series.reps !== undefined)
    .map((series) => ({
      assistKg: (series.load as { kg: number }).kg,
      reps: series.reps!,
      ...(series.rpe !== undefined ? { rpe: series.rpe } : {}),
    }));
}

/**
 * `statusState` : l'état comparé à la référence (le palier A du début de la
 * semaine, `v6StatusState`) ; par défaut, `state`.
 */
export function betBannerFor(workout: WorkoutSession, block: PerformedExerciseBlock, state: V6State, statusState: V6State = state): BetBanner | undefined {
  if (block.exerciseId !== BET_EXERCISE_ID) return undefined;

  if (workout.sessionTemplateId === v6LightTemplateIdAt(workout.date)) {
    const light = v6LightSession(state, workout.date);
    const lastValidation = [...state.events].reverse().find((event) => event.kind === "validation");
    const why = state.phase === "essai_libre" ? "phase essai libre" : lastValidation ? `volume après ${lastValidation.detail} validé` : "volume, avant toute validation";
    return {
      title: `Traction légère — ${light.assistKg} kg d'aide (${why})`,
      /* La consigne du modèle dit déjà le pourquoi. */
      lines: [{ label: "Cette séance", value: light.label }],
      sets: light.sets,
    };
  }

  if (!BET_FORCE_TEMPLATES.includes(workout.sessionTemplateId ?? "")) return undefined;
  const status = statusOf(statusState, workout.date);
  const a = state.aKg;

  if (state.phase === "gagne") {
    return { title: "Objectif gagné : 1 traction stricte", status, lines: [{ label: "Dernière séance", value: lastLine(state) }], sets: [] };
  }

  /*
   * Jour de test : depuis le test V4 (25/10/2026), 2 séries de complément
   * après le test, palier A + 7 kg d'aide, sans effet sur le palier. Une
   * séance réduite sans test (anciens jours de test) : rien.
   */
  if (block.reducedPrescription) {
    const tested = workout.blocks.some((item) => item.kind === "test" && item.protocolId === "protocol-traction");
    if (!tested) return undefined;
    const kg = a + TRACTION_TEST_V4_COMPLEMENT.offsetKg;
    return {
      title: `Complément après le test — ${kg} kg d'aide`,
      status,
      lines: [
        { label: "Cette séance", value: `${TRACTION_TEST_V4_COMPLEMENT.sets} séries à ${kg} kg, jusqu'à ${TRACTION_TEST_V4_COMPLEMENT.reps} reps propres — RPE ${TRACTION_TEST_V4_COMPLEMENT.rpeMax} max, 3 min de repos après le test` },
        { label: "Palier A", value: `${a} kg, inchangé : ces séries ne valident ni ne font reculer le palier` },
      ],
      sets: Array.from({ length: TRACTION_TEST_V4_COMPLEMENT.sets }, () => ({ assistKg: kg, reps: TRACTION_TEST_V4_COMPLEMENT.reps })),
    };
  }

  const force = v6ForceSession(state);

  if (state.phase === "essai_libre") {
    return {
      title: `Phase essai libre — 0 kg d'abord`,
      status,
      lines: [
        { label: "Dernière séance", value: lastLine(state) },
        ...force.lines.map((value, index) => ({ label: ["Essai", "Réussi", "Échec"][index] ?? "", value })),
      ],
      sets: force.sets,
    };
  }

  /* Repli saisi en série 1 : séries 2 et 3 un cran plus assisté, A inchangé. */
  const done = doneSets(block);
  const repli = done.length > 0 && isRepli(done.slice(0, 1), a);
  const fallback = a + V6_STEP_KG;
  const sets = repli ? force.sets.map((set, index) => (index === 0 ? set : { ...set, assistKg: fallback })) : force.sets;

  const warmup = TRACTION_WARMUP.map((item) => ({ assistKg: a + item.offsetKg, reps: item.reps }));

  return {
    title: `Palier A — ${a} kg d'aide`,
    status,
    lines: [
      { label: "Dernière séance", value: lastLine(state) },
      { label: "Échauffement", value: `${formatBetSets(warmup)}, repos 1 min — à noter en « Échauffement » : hors calcul du palier` },
      { label: "Cette séance", value: `3 séries à ${a} kg, jusqu'à ${V6_VALIDATION_REPS} reps propres — RPE ${V6_MAX_RPE} max, repos 3 min` },
      { label: "Repli", value: `série 1 à 2 reps ou moins, ou RPE 10 → séries 2 et 3 à ${fallback} kg ; le palier reste ${a} kg` },
      { label: "Validation", value: `5 / 5 / 5 à ${a} kg → ${a === V6_STEP_KG ? `phase essai libre, Muscu B à ${v6VolumeKgAfter(a)} kg` : `A passe à ${a - V6_STEP_KG} kg, Muscu B à ${v6VolumeKgAfter(a)} kg`}` },
    ],
    ...(repli ? { note: `Repli déclenché : séries 2 et 3 à ${fallback} kg. Le palier A reste ${a} kg ; séance exclue des régressions.` } : {}),
    sets,
    warmup,
  };
}

/** Ce qui est proposé pour une série de la brique du pari : aide, répétitions et rôle. */
export interface PlannedBetSeries extends BetSet {
  role: PerformedSeriesRole;
}

/**
 * La proposition de chaque série de la brique (L1, 02/11/2026), dans
 * l'ordre : les séries de travail suivent les séries prévues du pari
 * (`bet.sets`) dans leur ordre, quelle que soit leur position ; tant
 * qu'aucune série de travail n'est notée, les séries à venir proposent
 * d'abord l'échauffement qui reste (`bet.warmup`). Une série déjà notée
 * en échauffement ne reçoit rien. Aucune règle du pari n'est lue ici.
 */
export function plannedSeriesFor(series: ReadonlyArray<PerformedSeries>, bet: Pick<BetBanner, "sets" | "warmup"> | undefined): Array<PlannedBetSeries | undefined> {
  const ordered = [...series].sort((a, b) => a.position - b.position);
  if (!bet) return ordered.map(() => undefined);
  const warmup = bet.warmup ?? [];
  let work = 0;
  let warm = 0;
  return ordered.map((item): PlannedBetSeries | undefined => {
    if (item.status === "completed") {
      if (!isWorkSeries(item)) {
        warm += 1;
        return undefined;
      }
      const planned = bet.sets[work];
      work += 1;
      return planned ? { ...planned, role: "travail" } : undefined;
    }
    if (work === 0 && warm < warmup.length) {
      const planned = warmup[warm]!;
      warm += 1;
      return { ...planned, role: "echauffement" };
    }
    const planned = bet.sets[work];
    work += 1;
    return planned ? { ...planned, role: "travail" } : undefined;
  });
}
