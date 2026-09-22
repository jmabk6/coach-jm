import type { PerformedSeries, PerformedSeriesRole, RpeScaleVersion } from "../models";

/**
 * Règles pures du module Musculation (conception v1.6, § 4) — lot 4A :
 * l'échelle de RPE, le rôle de série et le drapeau « limitée par un
 * côté ». La validation des cadres (`validateFrame`) arrive au lot 4B.
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
