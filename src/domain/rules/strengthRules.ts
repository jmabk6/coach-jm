import type {
  Exercise,
  Id,
  PerformedSeries,
  PerformedSeriesRole,
  RpeScaleVersion,
  StrengthArchiveReason,
  StrengthFrameVersion,
  StrengthProgressionType,
  StrengthUnit,
  WorkoutSession,
} from "../models";
import { getLoadKg } from "./workoutRules";

/**
 * Règles pures du module Musculation (conception v1.6, § 4) : l'échelle
 * de RPE, le rôle de série et le drapeau « limitée par un côté » (4A) ;
 * la validation des paliers, le figeage et les lectures d'un cadre (4B).
 */

/* -------------------------------------------------------------------------- */
/* Échelle de RPE (spec Musculation § 6)                                      */
/* -------------------------------------------------------------------------- */

export const RPE_SCALE_V1_ID = "rpe-scale-v1";

/**
 * La table de la V1 : le RPE saisi garde sa valeur numérique, c'est sa
 * signification (répétitions en réserve) qui est fixée. La ligne
 * « 5 et moins » est portée par le RPE 5.
 */
export const RPE_SCALE_V1_TABLE: RpeScaleVersion["table"] = [
  { rpe: 10, repsInReserveLabel: "0 — échec, aucune répétition de plus" },
  { rpe: 9, repsInReserveLabel: "1" },
  { rpe: 8, repsInReserveLabel: "2 à 3" },
  { rpe: 7, repsInReserveLabel: "4 à 5" },
  { rpe: 6, repsInReserveLabel: "6 à 7" },
  { rpe: 5, repsInReserveLabel: "8 ou plus, estimation imprécise" },
];

/**
 * La V1 de l'échelle, telle que le seed l'écrit : `startDate` est la date
 * locale du premier lancement qui la crée (§ 4.5), jamais rétroactive.
 */
export function rpeScaleV1(startDate: string, createdAt: string): RpeScaleVersion {
  return {
    id: RPE_SCALE_V1_ID,
    number: 1,
    status: "active",
    table: RPE_SCALE_V1_TABLE.map((row) => ({ ...row })),
    startDate,
    createdAt,
  };
}

/** `10`, `9`, …, `5 et moins` : le libellé de la colonne RPE de l'aide. */
export function formatRpeRowLabel(rpe: number, table: RpeScaleVersion["table"]): string {
  const lowest = Math.min(...table.map((row) => row.rpe));

  return rpe === lowest ? `${rpe} et moins` : String(rpe);
}

/* -------------------------------------------------------------------------- */
/* Rôle et drapeau                                                            */
/* -------------------------------------------------------------------------- */

export const DEFAULT_SERIES_ROLE: PerformedSeriesRole = "travail";

export const seriesRoleLabels: Record<PerformedSeriesRole, string> = {
  travail: "Travail",
  echauffement: "Échauffement",
};

/** Libellé court pour une ligne de série : seul l'échauffement se signale. */
export const SERIES_WARMUP_SHORT_LABEL = "éch.";
export const SERIES_SIDE_LIMITED_LABEL = "limitée par un côté";

/** Rôle effectif : absent = travail (séries antérieures au lot 4). */
export function seriesRoleOf(series: Pick<PerformedSeries, "role">): PerformedSeriesRole {
  return series.role ?? DEFAULT_SERIES_ROLE;
}

export function isWorkSeries(series: Pick<PerformedSeries, "role">): boolean {
  return seriesRoleOf(series) === "travail";
}

/**
 * Série **comptée** pour un palier (décisions 6 et 10) : de travail et
 * non limitée par un côté. Les autres restent dans le volume et dans
 * toutes les statistiques existantes.
 */
export function isCountedSeries(series: Pick<PerformedSeries, "role" | "sideLimited">): boolean {
  return isWorkSeries(series) && series.sideLimited !== true;
}

export interface SeriesRoleSummary {
  total: number;
  counted: number;
  warmup: number;
  sideLimited: number;
}

export function summarizeSeriesRoles(
  series: ReadonlyArray<Pick<PerformedSeries, "role" | "sideLimited">>,
): SeriesRoleSummary {
  let counted = 0;
  let warmup = 0;
  let sideLimited = 0;

  for (const item of series) {
    if (isCountedSeries(item)) counted += 1;
    if (!isWorkSeries(item)) warmup += 1;
    else if (item.sideLimited === true) sideLimited += 1;
  }

  return { total: series.length, counted, warmup, sideLimited };
}

/**
 * `dont 4 comptées · 2 éch. · 1 limitée par un côté` — rien quand toutes
 * les séries comptent : l'affichage actuel ne change pas pour une séance
 * sans échauffement ni drapeau.
 */
export function formatSeriesRoleSummary(summary: SeriesRoleSummary): string | undefined {
  if (summary.counted === summary.total) return undefined;

  const parts = [`dont ${summary.counted} comptée${summary.counted > 1 ? "s" : ""}`];

  if (summary.warmup > 0) parts.push(`${summary.warmup} ${SERIES_WARMUP_SHORT_LABEL}`);
  if (summary.sideLimited > 0) {
    parts.push(`${summary.sideLimited} ${summary.sideLimited > 1 ? "limitées" : "limitée"} par un côté`);
  }

  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/* Cadres : validation d'un palier (conception v1.6, § 4.4)                   */
/* -------------------------------------------------------------------------- */

/**
 * Motifs de non-validation. Les quatre premiers sont ceux de la spec
 * (§ 4), exclusifs et dans cet ordre de priorité. Les deux autres sont
 * techniques : l'application autorise une série sans RPE et une charge
 * non renseignée, là où la spec suppose des données complètes.
 */
export type FrameValidationReason =
  | "series_manquantes"
  | "reps_insuffisantes"
  | "rpe_manquant"
  | "rpe_trop_eleve"
  | "cote_limite"
  | "charge_inconnue";

export const frameValidationReasonLabels: Record<FrameValidationReason, string> = {
  series_manquantes: "séries manquantes",
  reps_insuffisantes: "répétitions insuffisantes",
  rpe_manquant: "RPE non renseigné",
  rpe_trop_eleve: "RPE au-dessus de la cible",
  cote_limite: "série limitée par un côté",
  charge_inconnue: "charge non renseignée",
};

export type FrameValidationResult =
  | { validated: true; value: number; unit: StrengthUnit; ceilingReached?: boolean }
  | { validated: false; reason: FrameValidationReason };

/**
 * La durée en vigueur d'une version `duree_croissante` (v1.6, § 4.4) :
 * l'objectif en cours s'il existe, sinon la durée de départ.
 */
export function targetDurationInForce(version: StrengthFrameVersion): number | undefined {
  if (version.progressionType !== "duree_croissante") return undefined;
  if (version.currentTarget?.unit === "sec") return version.currentTarget.value;

  return version.targetDurationSec;
}

/**
 * Valide un palier sur les séries d'un exercice dans une séance : les
 * échauffements sont ignorés, il faut au moins `workSets` séries de
 * travail, chacune au haut de plage (ou à la durée en vigueur), sous la
 * cible de RPE, sans drapeau. La valeur du jalon est la charge tenue sur
 * toutes les séries (la plus basse ; pour l'assistance, la plus haute),
 * ou la durée en vigueur.
 */
export function validateFrame(
  version: StrengthFrameVersion,
  series: ReadonlyArray<PerformedSeries>,
): FrameValidationResult {
  const work = series.filter((item) => item.status === "completed" && isWorkSeries(item));

  if (work.length < version.workSets) return { validated: false, reason: "series_manquantes" };

  const duration = version.progressionType === "duree_croissante";
  const durationTarget = targetDurationInForce(version);

  for (const item of work) {
    const reached = duration
      ? durationTarget !== undefined && (item.durationSec ?? -1) >= durationTarget
      : version.repRange !== undefined && (item.reps ?? -1) >= version.repRange.max;

    if (!reached) return { validated: false, reason: "reps_insuffisantes" };
  }

  if (version.rpeTarget !== undefined) {
    const target = version.rpeTarget;

    if (work.some((item) => item.rpe === undefined)) return { validated: false, reason: "rpe_manquant" };
    if (work.some((item) => (item.rpe ?? 0) > target)) return { validated: false, reason: "rpe_trop_eleve" };
  }

  if (work.some((item) => item.sideLimited === true)) {
    return { validated: false, reason: "cote_limite" };
  }

  if (duration) {
    return { validated: true, value: durationTarget ?? 0, unit: "sec" };
  }

  const loads = work.map((item) => getLoadKg(item.load));
  const known = loads.filter((kg): kg is number => kg !== undefined);

  if (known.length < loads.length) return { validated: false, reason: "charge_inconnue" };

  const assistance = version.progressionType === "assistance_decroissante";
  const value = assistance ? Math.max(...known) : Math.min(...known);

  return {
    validated: true,
    value,
    unit: "kg",
    ...(assistance && value <= 0 ? { ceilingReached: true } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Cadres : paramètres, figeage, lectures                                     */
/* -------------------------------------------------------------------------- */

export const strengthProgressionTypeLabels: Record<StrengthProgressionType, string> = {
  charge_croissante: "Charge croissante",
  assistance_decroissante: "Assistance décroissante",
  duree_croissante: "Durée croissante",
};

export const strengthArchiveReasonLabels: Record<StrengthArchiveReason, string> = {
  plafond_atteint: "Plafond atteint",
  erreur_calibration: "Erreur de calibration",
  changement_materiel: "Changement de matériel",
};

/**
 * Types de progression possibles pour un exercice (spec § 5) : la charge
 * et l'assistance pour un exercice « charge + répétitions », la durée
 * pour un exercice en durée. Les autres mesures n'ont pas de cadre en V1.
 */
export function frameTypesFor(
  exercise: Pick<Exercise, "category" | "measurementType">,
): StrengthProgressionType[] {
  if (exercise.category !== "Musculation") return [];
  if (exercise.measurementType === "load_reps") return ["charge_croissante", "assistance_decroissante"];
  if (exercise.measurementType === "duration") return ["duree_croissante"];

  return [];
}

export type FrameParameters = Pick<
  StrengthFrameVersion,
  "progressionType" | "workSets" | "repRange" | "targetDurationSec" | "rpeTarget" | "restSec" | "increment"
>;

/**
 * Les paramètres au sens du figeage (§ 4.2) : les changer après la
 * première séance officielle crée la version suivante. `barWeightKg` et
 * `currentTarget` n'en font pas partie (v1.6).
 */
export function frameParametersChanged(before: FrameParameters, after: FrameParameters): boolean {
  return (
    before.progressionType !== after.progressionType ||
    before.workSets !== after.workSets ||
    before.repRange?.min !== after.repRange?.min ||
    before.repRange?.max !== after.repRange?.max ||
    before.targetDurationSec !== after.targetDurationSec ||
    before.rpeTarget !== after.rpeTarget ||
    before.restSec !== after.restSec ||
    before.increment.unit !== after.increment.unit ||
    before.increment.value !== after.increment.value
  );
}

export function isVersionFrozen(version: Pick<StrengthFrameVersion, "firstOfficialWorkoutId">): boolean {
  return version.firstOfficialWorkoutId !== undefined;
}

/** Les versions de cadre référencées par une séance : briques et tours. */
export function frameVersionIdsOf(workout: Pick<WorkoutSession, "blocks">): Set<Id> {
  const ids = new Set<Id>();

  for (const block of workout.blocks) {
    if (block.kind === "exercise") {
      if (block.frameVersionId !== undefined) ids.add(block.frameVersionId);
      continue;
    }

    if (block.kind === "group") {
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (child.frameVersionId !== undefined) ids.add(child.frameVersionId);
        }
      }
    }
  }

  return ids;
}

/**
 * Les séries d'une séance par version de cadre : les séries validées des
 * briques réalisées et les enfants de tour validés, vus comme des séries
 * de travail. C'est l'entrée de `validateFrame` à la clôture.
 */
export function seriesByFrameVersion(workout: Pick<WorkoutSession, "blocks">): Map<Id, PerformedSeries[]> {
  const result = new Map<Id, PerformedSeries[]>();
  const push = (versionId: Id, series: PerformedSeries) => {
    result.set(versionId, [...(result.get(versionId) ?? []), series]);
  };

  for (const block of workout.blocks) {
    if (block.kind === "exercise") {
      if (block.frameVersionId === undefined || block.status !== "performed") continue;
      for (const series of block.series ?? []) {
        if (series.status === "completed") push(block.frameVersionId, series);
      }
      continue;
    }

    if (block.kind === "group") {
      if (block.status === "skipped") continue;
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (child.frameVersionId === undefined || child.completedAt === undefined) continue;
          push(child.frameVersionId, {
            id: child.id,
            position: round.roundNumber - 1,
            status: "completed",
            ...(child.load !== undefined ? { load: child.load } : {}),
            ...(child.reps !== undefined ? { reps: child.reps } : {}),
            ...(child.durationSec !== undefined ? { durationSec: child.durationSec } : {}),
            ...(child.rpe !== undefined ? { rpe: child.rpe } : {}),
            completedAt: child.completedAt,
          });
        }
      }
    }
  }

  return result;
}

/**
 * « 3 × 10–12 · RPE ≤ 8 » — le résumé d'une version.
 */
export function formatFrameVersionSummary(version: StrengthFrameVersion): string {
  const parts: string[] = [];

  if (version.progressionType === "duree_croissante") {
    const target = targetDurationInForce(version);
    parts.push(`${version.workSets} × ${target !== undefined ? `${target} s` : "durée"}`);
  } else if (version.repRange) {
    parts.push(`${version.workSets} × ${version.repRange.min}–${version.repRange.max}`);
  } else {
    parts.push(`${version.workSets} séries`);
  }

  if (version.rpeTarget !== undefined) parts.push(`RPE ≤ ${version.rpeTarget}`);

  return parts.join(" · ");
}

const strengthNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** `100 kg`, `45 s` — une valeur de jalon ou d'objectif avec son unité. */
export function formatStrengthValue(value: number, unit: StrengthUnit): string {
  return unit === "kg" ? `${strengthNumber.format(value)} kg` : `${strengthNumber.format(value)} s`;
}

export interface LoadToWork {
  value: number;
  unit: StrengthUnit;
  source: "objectif" | "derniere_seance";
}

/**
 * « Charge à travailler » (v1.6, § 4.2 bis) : l'objectif en cours s'il
 * existe, sinon la charge de la dernière série de travail de la dernière
 * séance terminée de l'exercice, sinon rien — la proposition depuis
 * l'historique appartient à l'écran de création.
 */
export function loadToWork(
  version: StrengthFrameVersion,
  lastSeries: ReadonlyArray<PerformedSeries> | undefined,
): LoadToWork | undefined {
  if (version.currentTarget) {
    return { value: version.currentTarget.value, unit: version.currentTarget.unit, source: "objectif" };
  }

  const work = [...(lastSeries ?? [])]
    .reverse()
    .find((item) => item.status === "completed" && isWorkSeries(item));

  if (!work) return undefined;

  if (version.progressionType === "duree_croissante") {
    return work.durationSec !== undefined
      ? { value: work.durationSec, unit: "sec", source: "derniere_seance" }
      : undefined;
  }

  const kg = getLoadKg(work.load);

  return kg !== undefined ? { value: kg, unit: "kg", source: "derniere_seance" } : undefined;
}
