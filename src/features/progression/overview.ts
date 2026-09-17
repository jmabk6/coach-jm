import type {
  Exercise,
  Id,
  MuscleZone,
  PerformedBlock,
  PerformedSeries,
  PlannedSession,
  SessionCategory,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { calculateVolume } from "../../domain/rules/workoutRules";
import { getImportedHistoryStart, isImportedWorkoutId } from "../history/importedWorkouts";
import { isCardioExercise } from "./exerciseNature";
import { listCompletedRoundChildren } from "../workout/workoutRecap";
import { coversPreviousPeriod, isWithin, type DateRange, type Period } from "./period";
import { roundPercent } from "./rounding";

/**
 * Vue générale de Progression (§16) — moteur pur, indépendant de l'UI.
 * Chaque chiffre est recalculé depuis les réalisations brutes : aucun
 * cache, aucune valeur dérivée stockée. Les agrégats sont **neutres**
 * (ils disent combien, pas comment) ; le sens directionnel appartient aux
 * tendances par exercice (8A.2, 8A.3).
 */

/* -------------------------------------------------------------------------- */
/* Séances comptées                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Une séance compte en Progression si elle est **terminée** et porte au
 * moins une brique réalisée (décision Q2 du 17/09/2026). Une séance
 * arrêtée sans rien avoir validé reste dans l'historique, hors des
 * statistiques.
 */
export function isCountedWorkout(workout: WorkoutSession): boolean {
  return (
    workout.status === "completed" &&
    workout.blocks.some((block) => block.kind !== "note" && block.status === "performed")
  );
}

export function listCountedWorkouts(workouts: WorkoutSession[], range: DateRange): WorkoutSession[] {
  return workouts.filter((workout) => isCountedWorkout(workout) && isWithin(workout.date, range));
}

/**
 * Début de couverture de l'historique — la date à partir de laquelle
 * **toutes** les séances ont été relevées. Elle décide si la période
 * précédente est entièrement couverte, donc si une variation peut
 * s'afficher (§16).
 *
 * Règle prudente (décision du 17/09/2026) : la première séance comptée
 * ne prouve rien — on peut avoir commencé à noter au milieu d'une
 * pratique. Seule une date de collecte complète fait foi : celle de
 * l'import des feuilles de septembre 2026, quand il est présent dans les
 * données. Sans elle, aucune variation. Rien n'est inventé.
 */
export function getCoverageStart(workouts: WorkoutSession[]): string | undefined {
  return workouts.some((workout) => isImportedWorkoutId(workout.id))
    ? getImportedHistoryStart()
    : undefined;
}

/**
 * Première séance comptée : informative (« historique depuis le… »),
 * jamais une preuve de couverture.
 */
export function getFirstCountedDate(workouts: WorkoutSession[]): string | undefined {
  const dates = workouts.filter(isCountedWorkout).map((workout) => workout.date);

  return dates.length === 0 ? undefined : dates.reduce((min, date) => (date < min ? date : min));
}

/* -------------------------------------------------------------------------- */
/* Nature des briques                                                         */
/* -------------------------------------------------------------------------- */

type Nature = "series" | "cardio" | "other";

/**
 * Le périmètre d'une carte est le **mode de l'exercice** (§16), jamais la
 * catégorie de la séance : mode séries → Renforcement ; paliers ou mesure
 * simple de durée / distance → Cardio ; un test de mobilité en centimètres
 * n'est ni l'un ni l'autre. Un exercice supprimé de la bibliothèque est
 * relu d'après ce que la brique contient.
 */
function natureOf(block: PerformedBlock, exerciseById: Map<Id, Exercise>): Nature {
  if (block.kind === "group") return "series";
  if (block.kind === "note") return "other";

  const exercise = exerciseById.get(block.exerciseId);

  if (exercise) {
    if (exercise.mode === "series") return "series";
    return isCardioExercise(exercise) ? "cardio" : "other";
  }
  if (block.series) return "series";
  if (block.cardioSteps) return "cardio";
  if (block.simpleMeasurement) {
    const measure = block.simpleMeasurement;
    return measure.durationSec !== undefined || measure.distanceKm !== undefined ? "cardio" : "other";
  }

  return "other";
}

interface SeriesWithExercise {
  exerciseId: Id;
  series: PerformedSeries;
}

/**
 * Toutes les séries validées en mode séries d'une séance, avec l'exercice
 * réellement effectué — briques autonomes et enfants de tours.
 */
export function listSeriesModeSeries(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): SeriesWithExercise[] {
  const result: SeriesWithExercise[] = [];

  for (const block of workout.blocks) {
    if (block.kind === "note" || block.status !== "performed") continue;

    if (block.kind === "group") {
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (child.completedAt === undefined) continue;
          const [asSeries] = listCompletedRoundChildren([
            { ...block, rounds: [{ ...round, children: [child] }] },
          ]);
          if (asSeries) result.push({ exerciseId: child.exerciseId, series: asSeries });
        }
      }
      continue;
    }

    if (natureOf(block, exerciseById) !== "series") continue;

    for (const series of block.series ?? []) {
      if (series.status === "completed") result.push({ exerciseId: block.exerciseId, series });
    }
  }

  return result;
}

/**
 * Le volume total ne porte que sur les exercices `Charge + répétitions`
 * (§16) : un exercice au poids du corps n'y figure pas, même à zéro.
 * Un exercice supprimé est compté s'il porte une charge en kilos.
 */
function isVolumeEligible(exerciseId: Id, exerciseById: Map<Id, Exercise>): boolean {
  const exercise = exerciseById.get(exerciseId);

  return exercise ? exercise.measurementType === "load_reps" : true;
}

export function calculateWorkoutVolumeKg(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): number {
  return calculateVolume(
    listSeriesModeSeries(workout, exerciseById)
      .filter((item) => isVolumeEligible(item.exerciseId, exerciseById))
      .map((item) => item.series),
  );
}

interface CardioActivity {
  /** Durée mesurée, en secondes ; une distance seule n'y entre pas. */
  durationSec: number;
  present: boolean;
}

/**
 * Le cardio d'une séance : durée des paliers validés et des mesures
 * simples qui portent une durée. Une distance seule n'entre ni à zéro,
 * ni estimée (§16).
 */
export function describeWorkoutCardio(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): CardioActivity {
  let durationSec = 0;
  let present = false;

  for (const block of workout.blocks) {
    if (block.kind !== "exercise" || block.status !== "performed") continue;
    if (natureOf(block, exerciseById) !== "cardio") continue;

    const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");

    if (steps.length > 0) {
      present = true;
      durationSec += steps.reduce((sum, step) => sum + step.settings.durationSec, 0);
      continue;
    }

    if (block.simpleMeasurement) {
      present = true;
      durationSec += block.simpleMeasurement.durationSec ?? 0;
    }
  }

  return { durationSec, present };
}

/* -------------------------------------------------------------------------- */
/* Assiduité                                                                  */
/* -------------------------------------------------------------------------- */

export interface CompletionRate {
  /** Instances planifiées faites, séance terminée et comptée. */
  done: number;
  /** Instances attendues : faites, sautées ou échues non réalisées. */
  expected: number;
  /** Absent quand rien n'était attendu — jamais `0 %` par défaut. */
  percent?: number;
}

/**
 * Taux de réalisation du programme (§16, Q1) : instances planifiées de la
 * période **strictement antérieures à aujourd'hui**, faites, sautées ou
 * échues, au dénominateur ; au numérateur, celles dont la séance est
 * terminée et comptée. L'instance du jour n'entre que faite et réalisée ;
 * une séance en cours ne compte jamais. Les séances libres sont exclues.
 */
export function getCompletionRate(
  plannedSessions: PlannedSession[],
  workouts: WorkoutSession[],
  period: Period,
  today: string,
): CompletionRate {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  let done = 0;
  let expected = 0;

  for (const planned of plannedSessions) {
    if (!isWithin(planned.date, period)) continue;

    const workout = planned.workoutId ? workoutById.get(planned.workoutId) : undefined;
    const realised =
      planned.status === "done" && workout !== undefined && isCountedWorkout(workout);

    /* Échue : attendue quel que soit son statut — une séance encore « en
       cours » d'un jour passé n'est pas réalisée tant qu'elle n'est pas
       terminée. */
    if (planned.date < today) {
      expected += 1;
      if (realised) done += 1;
      continue;
    }

    /* Aujourd'hui : uniquement une fois terminée et réalisée. */
    if (planned.date === today && realised) {
      expected += 1;
      done += 1;
    }
  }

  return {
    done,
    expected,
    ...(expected > 0 ? { percent: Math.round((done / expected) * 100) } : {}),
  };
}

export interface TrainingFrequency {
  sessions: number;
  weeks: number;
  /** Séances par semaine, à une décimale ; absent sous 14 jours. */
  perWeek?: number;
}

/**
 * Fréquence d'entraînement : toutes les séances comptées de la période,
 * libres comprises, rapportées au nombre de semaines (jours ÷ 7). Sous
 * 14 jours, le nombre seul : pas de faux rythme hebdomadaire.
 */
export function getTrainingFrequency(workouts: WorkoutSession[], period: Period): TrainingFrequency {
  const sessions = listCountedWorkouts(workouts, period).length;
  const weeks = period.days / 7;

  return {
    sessions,
    weeks,
    ...(period.days >= 14 ? { perWeek: Math.round((sessions / weeks) * 10) / 10 } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Cartes de synthèse                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `+18 %` vs la période précédente de même durée ; absent si la période
 * précédente n'est pas entièrement couverte par l'historique, ou si la
 * base est nulle (une variation depuis zéro n'a pas de sens).
 */
export function variationPercent(
  current: number,
  previous: number,
  covered: boolean,
): number | undefined {
  if (!covered || previous <= 0) return undefined;

  return roundPercent(((current - previous) / previous) * 100);
}

export interface StrengthTotals {
  volumeKg: number;
  seriesDone: number;
  /** Séances comptées contenant au moins une série réalisée. */
  sessions: number;
}

export interface StrengthSummary extends StrengthTotals {
  previous?: StrengthTotals;
  variation: { volume?: number; series?: number; sessions?: number };
}

function strengthTotals(
  workouts: WorkoutSession[],
  exerciseById: Map<Id, Exercise>,
  range: DateRange,
): StrengthTotals {
  let volumeKg = 0;
  let seriesDone = 0;
  let sessions = 0;

  for (const workout of listCountedWorkouts(workouts, range)) {
    const series = listSeriesModeSeries(workout, exerciseById);

    if (series.length === 0) continue;

    sessions += 1;
    seriesDone += series.length;
    volumeKg += calculateWorkoutVolumeKg(workout, exerciseById);
  }

  return { volumeKg, seriesDone, sessions };
}

export function getStrengthSummary(
  workouts: WorkoutSession[],
  exerciseById: Map<Id, Exercise>,
  period: Period,
  coverageStart: string | undefined,
): StrengthSummary {
  const current = strengthTotals(workouts, exerciseById, period);
  const covered = coversPreviousPeriod(period, coverageStart);

  if (!covered) return { ...current, variation: {} };

  const previous = strengthTotals(workouts, exerciseById, period.previous);
  const volume = variationPercent(current.volumeKg, previous.volumeKg, true);
  const series = variationPercent(current.seriesDone, previous.seriesDone, true);
  const sessions = variationPercent(current.sessions, previous.sessions, true);

  return {
    ...current,
    previous,
    variation: {
      ...(volume !== undefined ? { volume } : {}),
      ...(series !== undefined ? { series } : {}),
      ...(sessions !== undefined ? { sessions } : {}),
    },
  };
}

export interface CardioTotals {
  durationSec: number;
  /** Séances comptées contenant au moins un exercice cardio réalisé. */
  sessions: number;
}

export interface CardioSummary extends CardioTotals {
  previous?: CardioTotals;
  variation: { duration?: number; sessions?: number };
}

function cardioTotals(
  workouts: WorkoutSession[],
  exerciseById: Map<Id, Exercise>,
  range: DateRange,
): CardioTotals {
  let durationSec = 0;
  let sessions = 0;

  for (const workout of listCountedWorkouts(workouts, range)) {
    const cardio = describeWorkoutCardio(workout, exerciseById);

    if (!cardio.present) continue;

    sessions += 1;
    durationSec += cardio.durationSec;
  }

  return { durationSec, sessions };
}

export function getCardioSummary(
  workouts: WorkoutSession[],
  exerciseById: Map<Id, Exercise>,
  period: Period,
  coverageStart: string | undefined,
): CardioSummary {
  const current = cardioTotals(workouts, exerciseById, period);
  const covered = coversPreviousPeriod(period, coverageStart);

  if (!covered) return { ...current, variation: {} };

  const previous = cardioTotals(workouts, exerciseById, period.previous);
  const duration = variationPercent(current.durationSec, previous.durationSec, true);
  const sessions = variationPercent(current.sessions, previous.sessions, true);

  return {
    ...current,
    previous,
    variation: {
      ...(duration !== undefined ? { duration } : {}),
      ...(sessions !== undefined ? { sessions } : {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Répartitions                                                               */
/* -------------------------------------------------------------------------- */

export interface BreakdownLine<K extends string> {
  key: K;
  count: number;
  /** Sur le total affiché, arrondi à l'unité. */
  percent: number;
}

export interface Breakdown<K extends string> {
  lines: BreakdownLine<K>[];
  total: number;
}

export type CategoryKey = SessionCategory | "Sans catégorie";

const CATEGORY_ORDER: SessionCategory[] = ["Musculation", "Cardio", "Mobilité"];

/**
 * Séances par catégorie : la catégorie du **modèle** de la séance
 * (planifiée ou libre depuis un modèle) ; une séance libre sans modèle
 * n'a pas de catégorie et figure sur sa propre ligne, seulement si elle
 * n'est pas vide. La somme des lignes est le total affiché.
 */
export function getCategoryBreakdown(
  workouts: WorkoutSession[],
  templateById: Map<Id, SessionTemplate>,
  range: DateRange,
): Breakdown<CategoryKey> {
  const counts = new Map<CategoryKey, number>(CATEGORY_ORDER.map((key) => [key, 0]));
  let uncategorised = 0;

  for (const workout of listCountedWorkouts(workouts, range)) {
    const category = workout.sessionTemplateId
      ? templateById.get(workout.sessionTemplateId)?.category
      : undefined;

    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    else uncategorised += 1;
  }

  if (uncategorised > 0) counts.set("Sans catégorie", uncategorised);

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return {
    lines: [...counts.entries()].map(([key, count]) => ({
      key,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    })),
    total,
  };
}

export const ZONE_ORDER: MuscleZone[] = ["Jambes", "Dos", "Pecs", "Épaules", "Bras", "Core"];

/**
 * Séries réalisées par zone : chaque série d'un exercice en mode séries
 * compte pour **la** zone de son exercice — une seule zone, aucun double
 * comptage ; paliers et mesures simples n'y entrent pas. Une série dont
 * l'exercice a disparu ou n'a pas de zone reste dans le total.
 */
export function getZoneBreakdown(
  workouts: WorkoutSession[],
  exerciseById: Map<Id, Exercise>,
  range: DateRange,
): Breakdown<MuscleZone | "Autre"> {
  const counts = new Map<MuscleZone | "Autre", number>(ZONE_ORDER.map((zone) => [zone, 0]));
  let other = 0;

  for (const workout of listCountedWorkouts(workouts, range)) {
    for (const item of listSeriesModeSeries(workout, exerciseById)) {
      const zone = exerciseById.get(item.exerciseId)?.zone;

      if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1);
      else other += 1;
    }
  }

  if (other > 0) counts.set("Autre", other);

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return {
    lines: [...counts.entries()].map(([key, count]) => ({
      key,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    })),
    total,
  };
}

/* -------------------------------------------------------------------------- */
/* Dernières séances                                                          */
/* -------------------------------------------------------------------------- */

export interface RecentWorkoutLine {
  workoutId: Id;
  date: string;
  name: string;
  category?: SessionCategory;
  /** `35 min · 8 paliers`, `7 km`, `durée non renseignée`. */
  summary: string;
}

export function describeWorkoutSummary(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): string {
  const parts: string[] = [];

  if (workout.activeDurationSec > 0) {
    parts.push(`${Math.round(workout.activeDurationSec / 60)} min`);
  }

  let steps = 0;
  let distanceKm = 0;

  for (const block of workout.blocks) {
    if (block.kind !== "exercise" || block.status !== "performed") continue;
    if (natureOf(block, exerciseById) !== "cardio") continue;
    steps += (block.cardioSteps ?? []).filter((step) => step.status === "completed").length;
    distanceKm += block.simpleMeasurement?.distanceKm ?? 0;
  }

  if (steps > 0) parts.push(`${steps} palier${steps > 1 ? "s" : ""}`);
  if (distanceKm > 0) {
    parts.push(`${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(distanceKm)} km`);
  }

  return parts.length > 0 ? parts.join(" · ") : "durée non renseignée";
}

export function listRecentWorkouts(
  workouts: WorkoutSession[],
  templateById: Map<Id, SessionTemplate>,
  exerciseById: Map<Id, Exercise>,
  range: DateRange,
  limit = 6,
): RecentWorkoutLine[] {
  return listCountedWorkouts(workouts, range)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
    .map((workout) => {
      const template = workout.sessionTemplateId
        ? templateById.get(workout.sessionTemplateId)
        : undefined;

      return {
        workoutId: workout.id,
        date: workout.date,
        name: template?.name ?? "Séance libre",
        ...(template ? { category: template.category } : {}),
        summary: describeWorkoutSummary(workout, exerciseById),
      };
    });
}

/* -------------------------------------------------------------------------- */
/* Vue générale                                                               */
/* -------------------------------------------------------------------------- */

export interface ProgressionSources {
  workouts: WorkoutSession[];
  plannedSessions: PlannedSession[];
  templates: SessionTemplate[];
  exercises: Exercise[];
}

export interface Overview {
  period: Period;
  /** Date de collecte complète, si elle est connue. */
  coverageStart?: string;
  /** Première séance comptée, à titre indicatif. */
  firstCountedDate?: string;
  /** Vrai quand les variations `vs période précédente` peuvent s'afficher. */
  previousCovered: boolean;
  completion: CompletionRate;
  frequency: TrainingFrequency;
  strength: StrengthSummary;
  cardio: CardioSummary;
  categories: Breakdown<CategoryKey>;
  zones: Breakdown<MuscleZone | "Autre">;
  recent: RecentWorkoutLine[];
}

export interface OverviewOptions {
  /**
   * Date de collecte complète imposée par l'appelant (jeu de référence,
   * test). Par défaut, déduite des données : voir `getCoverageStart`.
   */
  coverageStart?: string;
}

export function buildOverview(
  sources: ProgressionSources,
  period: Period,
  today: string,
  options: OverviewOptions = {},
): Overview {
  const exerciseById = new Map(sources.exercises.map((exercise) => [exercise.id, exercise]));
  const templateById = new Map(sources.templates.map((template) => [template.id, template]));
  const coverageStart = options.coverageStart ?? getCoverageStart(sources.workouts);
  const firstCountedDate = getFirstCountedDate(sources.workouts);

  return {
    period,
    ...(coverageStart ? { coverageStart } : {}),
    ...(firstCountedDate ? { firstCountedDate } : {}),
    previousCovered: coversPreviousPeriod(period, coverageStart),
    completion: getCompletionRate(sources.plannedSessions, sources.workouts, period, today),
    frequency: getTrainingFrequency(sources.workouts, period),
    strength: getStrengthSummary(sources.workouts, exerciseById, period, coverageStart),
    cardio: getCardioSummary(sources.workouts, exerciseById, period, coverageStart),
    categories: getCategoryBreakdown(sources.workouts, templateById, period),
    zones: getZoneBreakdown(sources.workouts, exerciseById, period),
    recent: listRecentWorkouts(sources.workouts, templateById, exerciseById, period),
  };
}
