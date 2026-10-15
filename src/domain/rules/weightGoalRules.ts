import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { BodyMeasurement } from "../models";
import { deviceSeries } from "./bodyTargetRules";
import { formatFr } from "./dateFr";

/**
 * Objectif Poids (15/10/2026) — règles pures, partagées par l'écran de
 * l'objectif, la liste des objectifs et l'Accueil.
 *
 * - Poids actuel : la dernière mesure de la balance de référence, la même
 *   source que « Composition corporelle » (jamais un autre appareil ni la
 *   copie d'une pesée).
 * - Départ fixe : celui enregistré dans l'objectif (91,15 kg le 5/10/2026,
 *   seed 40) ; ajouter ou supprimer une ancienne pesée ne le déplace pas.
 *   Sans départ enregistré : la première pesée, signalée « provisoire ».
 * - Trajectoire : −0,5 kg par semaine depuis le départ, lue à la date de la
 *   dernière pesée : prévu = départ − 0,5 × jours / 7.
 * - Échéance estimée : depuis la dernière pesée, vers l'objectif enregistré,
 *   au même rythme : jours = (actuel − objectif) / 0,5 × 7, arrondis au jour
 *   supérieur. Échéance de départ : la même règle depuis le départ ;
 *   l'avance temporelle est l'écart entre les deux dates.
 * - Données manquantes : une explication, jamais un zéro ni un statut
 *   favorable par défaut ; objectif atteint : jamais de durée négative.
 * L'ancienne échéance fixe (31/03/2027) ne sert plus au Poids.
 */

/** Rythme de la trajectoire et des échéances. */
export const WEIGHT_LOSS_KG_PER_WEEK = 0.5;

export interface WeightReading {
  date: string;
  kg: number;
}

export type WeightPace =
  | { kind: "no_weight" }
  | { kind: "first_weight"; start: WeightReading }
  | {
      kind: "tracking";
      /** Date de la dernière pesée, où se lit la comparaison. */
      date: string;
      expectedKg: number;
      /** Prévu − actuel : positif = avance (kg sous la trajectoire). */
      gapKg: number;
    };

export type WeightEta =
  | { kind: "no_weight" }
  | { kind: "no_target" }
  | { kind: "reached" }
  | {
      kind: "estimate";
      date: string;
      days: number;
      /** Échéance de départ (même cible, même rythme) ; absente si le départ est déjà sous l'objectif. */
      startDate?: string;
      /** Échéance de départ − échéance estimée, en jours : positif = avance. */
      aheadDays?: number;
    };

export interface WeightGoalOverview {
  start?: WeightReading;
  /** Départ enregistré dans l'objectif (sinon : la première pesée, provisoire). */
  startStored?: boolean;
  current?: WeightReading;
  /** Actuel − départ, en kg. */
  changeKg?: number;
  target?: number;
  pace: WeightPace;
  eta: WeightEta;
}

/** Le poids prévu par la trajectoire à une date. */
export function weightOnPace(start: WeightReading, date: string): number {
  const days = Math.max(0, differenceInCalendarDays(parseISO(date), parseISO(start.date)));
  return start.kg - (WEIGHT_LOSS_KG_PER_WEEK * days) / 7;
}

/** La date à laquelle `targetKg` serait atteint depuis `from`, à −0,5 kg par semaine (jours arrondis au supérieur). */
export function weightEtaFrom(from: WeightReading, targetKg: number): { date: string; days: number } {
  const days = Math.max(0, Math.ceil(((from.kg - targetKg) / WEIGHT_LOSS_KG_PER_WEEK) * 7 - 1e-9));
  return { date: format(addDays(parseISO(from.date), days), "yyyy-MM-dd"), days };
}

export function weightGoalOverview(
  measurements: readonly BodyMeasurement[],
  device: string,
  target: number | undefined,
  storedStart: { date: string; value: number } | undefined,
): WeightGoalOverview {
  const series = deviceSeries(measurements, device);
  const first = series[0];
  const last = series.at(-1);
  const start = storedStart ? { date: storedStart.date, kg: storedStart.value } : first ? { date: first.date, kg: first.weightKg } : undefined;
  if (!last || !start) {
    return { ...(start ? { start, startStored: storedStart !== undefined } : {}), ...(target !== undefined ? { target } : {}), pace: { kind: "no_weight" }, eta: { kind: "no_weight" } };
  }

  const current = { date: last.date, kg: last.weightKg };
  const onlyStart = !storedStart && first === last;
  const expectedKg = weightOnPace(start, current.date);
  const pace: WeightPace = onlyStart ? { kind: "first_weight", start } : { kind: "tracking", date: current.date, expectedKg, gapKg: expectedKg - current.kg };

  let eta: WeightEta;
  if (target === undefined) eta = { kind: "no_target" };
  else if (current.kg <= target) eta = { kind: "reached" };
  else {
    const estimate = weightEtaFrom(current, target);
    const fromStart = start.kg > target ? weightEtaFrom(start, target) : undefined;
    eta = {
      kind: "estimate",
      ...estimate,
      ...(fromStart ? { startDate: fromStart.date, aheadDays: differenceInCalendarDays(parseISO(fromStart.date), parseISO(estimate.date)) } : {}),
    };
  }

  return {
    start,
    startStored: storedStart !== undefined,
    current,
    changeKg: current.kg - start.kg,
    ...(target !== undefined ? { target } : {}),
    pace,
    eta,
  };
}

/* -------------------------------------------------------------------------- */
/* Cartes de l'écran                                                          */
/* -------------------------------------------------------------------------- */

export type WeightTone = "good" | "bad" | "neutral";

/** Une case : la valeur en grand, une ligne dessous, puis un trait, une ligne forte (colorée) et une ligne en petit. */
export interface WeightCardText {
  value: string;
  sub?: string;
  highlight?: string;
  tone?: WeightTone;
  foot?: string;
}

const kg2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const kg1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortDate = (date: string) => formatFr(date, "d MMM");
const longDate = (date: string) => formatFr(date, "d MMMM yyyy");
const tenth = (value: number) => Math.round(value * 10) / 10;
const toneOf = (value: number): WeightTone => (value > 0 ? "good" : value < 0 ? "bad" : "neutral");

/** « 5 sem. et 3 j », « 3 j », « 2 sem. ». */
function weeksAndDays(days: number): string {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  if (weeks === 0) return `${rest} j`;
  return rest === 0 ? `${weeks} sem.` : `${weeks} sem. et ${rest} j`;
}

/** « Poids actuel » : 87,75 kg · 15 octobre 2026 · −3,4 kg · Depuis le 5 oct. */
export function weightCurrentCard(overview: WeightGoalOverview): WeightCardText {
  const { current, start, changeKg, startStored } = overview;
  if (!current || !start || changeKg === undefined) return { value: "—", sub: "Aucune pesée RENPHO pour l'instant" };
  const card: WeightCardText = { value: `${kg2.format(current.kg)} kg`, sub: longDate(current.date) };
  if (current.date === start.date && current.kg === start.kg) return { ...card, foot: startStored ? "Poids de départ" : "Départ provisoire" };
  const change = tenth(changeKg);
  return {
    ...card,
    highlight: change === 0 ? `${kg1.format(0)} kg` : `${change < 0 ? "−" : "+"}${kg1.format(Math.abs(change))} kg`,
    tone: toneOf(-change),
    foot: `Depuis le ${shortDate(start.date)}${startStored ? "" : " (départ provisoire)"}`,
  };
}

/** « Trajectoire » : 2,7 kg · d'avance · Prévu : 90,4 kg · Au 15 octobre ; « Sur la trajectoire » si l'écart arrondi au dixième est nul. */
export function weightPaceCard(overview: WeightGoalOverview): WeightCardText {
  const { pace } = overview;
  switch (pace.kind) {
    case "no_weight":
      return { value: "—", sub: "Pas encore de pesée RENPHO" };
    case "first_weight":
      return { value: "Départ", sub: `${kg2.format(pace.start.kg)} kg le ${shortDate(pace.start.date)}`, foot: "L'écart se calcule dès la 2e pesée" };
    case "tracking": {
      const gap = tenth(pace.gapKg);
      const footer = { highlight: `Prévu : ${kg1.format(pace.expectedKg)} kg`, foot: `Au ${formatFr(pace.date, "d MMMM")}` };
      if (gap === 0) return { value: "Sur la trajectoire", ...footer };
      return { value: `${kg1.format(Math.abs(gap))} kg`, sub: gap > 0 ? "d'avance" : "de retard", tone: toneOf(gap), ...footer };
    }
  }
}

/** « Échéance estimée » : 12 avril 2027 · Rythme : −0,5 kg/sem. · 5 sem. et 3 j d'avance · Départ : 20 mai 2027. */
export function weightEtaCard(overview: WeightGoalOverview): WeightCardText {
  const { eta, current } = overview;
  switch (eta.kind) {
    case "no_weight":
      return { value: "—", sub: "Pas encore de pesée RENPHO" };
    case "no_target":
      return { value: "—", sub: "Objectif à définir" };
    case "reached":
      return { value: "Objectif atteint", sub: `${kg2.format(current!.kg)} kg le ${longDate(current!.date)}` };
    case "estimate": {
      const card: WeightCardText = { value: longDate(eta.date), sub: `Rythme : −${kg1.format(WEIGHT_LOSS_KG_PER_WEEK)} kg/sem.` };
      if (eta.startDate === undefined || eta.aheadDays === undefined) return card;
      const highlight =
        eta.aheadDays === 0 ? "Échéance inchangée" : `${weeksAndDays(Math.abs(eta.aheadDays))} ${eta.aheadDays > 0 ? "d'avance" : "de retard"}`;
      return { ...card, highlight, tone: toneOf(eta.aheadDays), foot: `Départ : ${longDate(eta.startDate)}` };
    }
  }
}

/** La trajectoire de la courbe : du départ, à −0,5 kg par semaine, jusqu'à l'objectif ; rien sans départ ni objectif sous le départ. */
export function weightTrajectory(overview: WeightGoalOverview): [{ date: string; value: number }, { date: string; value: number }] | undefined {
  const { start, target } = overview;
  if (!start || target === undefined || start.kg <= target) return undefined;
  return [{ date: start.date, value: start.kg }, { date: weightEtaFrom(start, target).date, value: target }];
}

/* -------------------------------------------------------------------------- */
/* Liste des objectifs et Accueil : les mêmes calculs                         */
/* -------------------------------------------------------------------------- */

export interface WeightGoalRow {
  subtitle: string;
  value: string;
  reached?: string;
  target: string;
  /** Part de la perte réalisée depuis le départ fixe, bornée à [0, 100]. */
  bar: number;
}

/** La ligne de la liste des objectifs. */
export function weightGoalRowText(overview: WeightGoalOverview): WeightGoalRow {
  const { start, current, target, pace, eta } = overview;
  const base = { subtitle: `Trajectoire −${kg1.format(WEIGHT_LOSS_KG_PER_WEEK)} kg/semaine`, target: target !== undefined ? `Objectif : ${kg2.format(target)} kg` : "Objectif : à définir" };
  if (!current || !start) return { ...base, value: "Pas encore de pesée RENPHO", bar: 0 };
  const weight = `${kg2.format(current.kg)} kg`;
  if (eta.kind === "reached") return { ...base, value: weight, reached: "Objectif atteint", bar: 100 };
  const card = weightPaceCard(overview);
  const value = pace.kind === "tracking" ? `${weight} · ${card.sub ? `${card.value} ${card.sub}` : card.value}` : weight;
  const span = target !== undefined ? start.kg - target : 0;
  const bar = span > 0 ? Math.min(100, Math.max(0, Math.round(((start.kg - current.kg) / span) * 100))) : 0;
  return { ...base, value, bar };
}

/** Le statut en un mot de l'Accueil ; rien tant qu'il n'y a pas d'écart mesurable. */
export function weightGoalShortStatus(overview: WeightGoalOverview): { label: string; tone: "ahead" | "on_track" | "behind" | "reached" } | undefined {
  if (overview.eta.kind === "reached") return { label: "Atteint", tone: "reached" };
  if (overview.pace.kind !== "tracking") return undefined;
  const gap = tenth(overview.pace.gapKg);
  return gap > 0 ? { label: "En avance", tone: "ahead" } : gap < 0 ? { label: "En retard", tone: "behind" } : { label: "Sur la trajectoire", tone: "on_track" };
}
