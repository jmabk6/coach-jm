import type {
  Exercise,
  PerformedBlock,
  PerformedExerciseBlock,
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
} from "../../../domain";
import { addDays, parseISO } from "date-fns";
import { formatLocalDate } from "../../../domain/rules/programRules";

function shiftDate(date: string, days: number): string {
  return formatLocalDate(addDays(parseISO(date), days));
}

/** Les quatre tables que le jeu remplit. */
export interface EstablishedSources {
  workouts: WorkoutSession[];
  plannedSessions: PlannedSession[];
  templates: SessionTemplate[];
  exercises: Exercise[];
}

/**
 * Jeu de référence « état établi » (§16) : 26 semaines **fictives** mais
 * cohérentes, écrit pour l'ancien écran Progression (retiré au lot N) et
 * gardé pour les tests de sauvegarde et de migration. Identifiants
 * préfixés `fx-` : jamais mêlés aux données réelles, jamais injectés
 * durablement dans une base — les tests le construisent en mémoire, une
 * vérification dans le navigateur le retire derrière elle.
 *
 * Rythme : lundi Muscu A (planifiée), mercredi Cardio (planifiée),
 * vendredi Muscu B (planifiée), samedi une séance libre une semaine sur
 * trois (mobilité avec modèle, puis sans modèle). Une semaine sur quatre
 * le vendredi est sauté ; une semaine sur six le lundi est manqué. Les
 * charges montent doucement au fil des semaines.
 */

export const ESTABLISHED_WEEKS = 26;
const T0 = "2026-01-01T00:00:00.000Z";

export interface EstablishedDataset extends EstablishedSources {
  today: string;
  /** Début de la collecte du jeu fictif : le lundi de sa première semaine. */
  coverageStart: string;
}

function exercise(id: string, name: string, extra: Partial<Exercise>): Exercise {
  return {
    id,
    name,
    category: "Musculation",
    zone: "Jambes",
    movement: "Squat",
    equipment: "Machine",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  } as Exercise;
}

export const establishedExercises: Exercise[] = [
  exercise("fx-squat", "Squat barre", { zone: "Jambes", equipment: "Barre" }),
  exercise("fx-tirage", "Tirage vertical", { zone: "Dos", movement: "Tirage", equipment: "Poulie" }),
  exercise("fx-presse", "Presse à cuisses", { zone: "Jambes" }),
  exercise("fx-curl", "Curl haltères", { zone: "Bras", movement: "Isolation", equipment: "Haltères" }),
  exercise("fx-pompes", "Pompes", { zone: "Pecs", movement: "Poussée", equipment: "Poids du corps", measurementType: "reps" }),
  exercise("fx-planche", "Planche", { zone: "Core", movement: "Gainage", equipment: "Poids du corps", measurementType: "duration" }),
  exercise("fx-tapis", "Tapis de course", { category: "Cardio", equipment: "Tapis", mode: "steps", measurementType: "duration_speed_incline" }),
  exercise("fx-velo", "Vélo", { category: "Cardio", equipment: "Vélo", mode: "simple", measurementType: "duration_distance", speedDisplay: "speed_kmh" }),
];

function template(id: string, name: string, category: SessionTemplate["category"]): SessionTemplate {
  return { id, name, category, status: "active", position: 0, blocks: [], createdAt: T0, updatedAt: T0 };
}

export const establishedTemplates: SessionTemplate[] = [
  template("fx-tpl-muscu-a", "Muscu A", "Musculation"),
  template("fx-tpl-muscu-b", "Muscu B", "Musculation"),
  template("fx-tpl-cardio", "Cardio", "Cardio"),
  template("fx-tpl-mobilite", "Mobilité", "Mobilité"),
];

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

function seriesBlock(exerciseId: string, count: number, values: { kg?: number; reps?: number; sec?: number; rpe?: number }): PerformedExerciseBlock {
  const id = nextId("fx-b");
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions:
      values.sec !== undefined
        ? { shape: "duration", sets: count, durationSec: values.sec, restBetweenSetsSec: 60 }
        : { shape: "reps", sets: count, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
    series: Array.from({ length: count }, (_, index) => ({
      id: `${id}-s${index + 1}`,
      position: index,
      status: "completed" as const,
      ...(values.kg !== undefined ? { load: { kind: "total" as const, kg: values.kg } } : {}),
      ...(values.reps !== undefined ? { reps: values.reps } : {}),
      ...(values.sec !== undefined ? { durationSec: values.sec } : {}),
      ...(values.rpe !== undefined ? { rpe: values.rpe } : {}),
      ...(index < count - 1 ? { actualRestAfterSec: 90 } : {}),
    })),
  };
}

function tapisBlock(steps: Array<{ sec: number; kmh: number; incline: number; bpm?: number }>): PerformedExerciseBlock {
  const id = nextId("fx-b");
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "fx-tapis",
    status: "performed",
    snapshotInstructions: { shape: "steps", steps: [] },
    cardioSteps: steps.map((step, index) => ({
      id: `${id}-p${index + 1}`,
      position: index,
      status: "completed" as const,
      settings: { durationSec: step.sec, speedKmh: step.kmh, inclinePercent: step.incline },
      ...(step.bpm !== undefined ? { bpm: step.bpm } : {}),
    })),
  };
}

function veloBlock(durationSec: number, distanceKm: number, bpm: number): PerformedExerciseBlock {
  return {
    id: nextId("fx-b"),
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "fx-velo",
    status: "performed",
    snapshotInstructions: { shape: "duration_distance" },
    simpleMeasurement: { durationSec, distanceKm, bpm },
  };
}

function workout(
  id: string,
  date: string,
  blocks: PerformedBlock[],
  activeMinutes: number,
  extra: Partial<WorkoutSession>,
): WorkoutSession {
  const startedAt = `${date}T16:00:00.000Z`;
  const completedAt = `${date}T${String(16 + Math.floor((activeMinutes + 5) / 60)).padStart(2, "0")}:${String((activeMinutes + 5) % 60).padStart(2, "0")}:00.000Z`;

  return {
    id,
    source: "free",
    status: "completed",
    date,
    startedAt,
    lastActionAt: completedAt,
    completedAt,
    activeDurationSec: activeMinutes * 60,
    blocks: blocks.map((block, position) => ({ ...block, position })),
    createdAt: startedAt,
    updatedAt: completedAt,
    ...extra,
  };
}

/**
 * Construit le jeu pour un `today` donné (par défaut le jeudi
 * 10 septembre 2026, comme les maquettes). Le lundi de la semaine
 * courante est la dernière semaine ; les précédentes remontent 25 semaines.
 */
export function buildEstablishedDataset(today = "2026-09-10"): EstablishedDataset {
  counter = 0;
  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay(); // 0 = dimanche
  const mondayOffset = (weekday + 6) % 7;
  const currentMonday = shiftDate(today, -mondayOffset);
  const firstMonday = shiftDate(currentMonday, -7 * (ESTABLISHED_WEEKS - 1));

  const workouts: WorkoutSession[] = [];
  const plannedSessions: PlannedSession[] = [];

  const plan = (id: string, date: string, templateId: string, status: PlannedSession["status"], workoutId?: string) => {
    plannedSessions.push({
      id,
      date,
      sessionTemplateId: templateId,
      status,
      ...(workoutId ? { workoutId } : {}),
      source: "manual",
      createdAt: T0,
      updatedAt: T0,
    });
  };

  for (let week = 0; week < ESTABLISHED_WEEKS; week += 1) {
    const monday = shiftDate(firstMonday, 7 * week);
    const wednesday = shiftDate(monday, 2);
    const friday = shiftDate(monday, 4);
    const saturday = shiftDate(monday, 5);
    const squatKg = 40 + week * 0.5;
    const presseKg = 80 + week;

    /* Lundi — Muscu A : squat, tirage, planche, puis 10 min de tapis. */
    if (monday <= today) {
      const planId = `fx-plan-a-${week}`;
      if (week % 6 === 5) {
        plan(planId, monday, "fx-tpl-muscu-a", "upcoming");
      } else {
        const id = `fx-w-a-${week}`;
        workouts.push(
          workout(
            id,
            monday,
            [
              seriesBlock("fx-squat", 3, { kg: squatKg, reps: 10, rpe: 7 }),
              seriesBlock("fx-tirage", 3, { kg: 30 + Math.floor(week / 4) * 2.5, reps: 10, rpe: 7 }),
              seriesBlock("fx-planche", 2, { sec: 45 + week }),
              tapisBlock([
                { sec: 300, kmh: 5, incline: 0, bpm: 110 + (week % 3) },
                { sec: 300, kmh: 5, incline: 5, bpm: 132 - week },
              ]),
            ],
            48,
            { sessionTemplateId: "fx-tpl-muscu-a", source: "planned", plannedSessionId: planId },
          ),
        );
        plan(planId, monday, "fx-tpl-muscu-a", "done", id);
      }
    }

    /* Mercredi — Cardio : 25 min de vélo. */
    if (wednesday <= today) {
      const planId = `fx-plan-c-${week}`;
      const id = `fx-w-c-${week}`;
      workouts.push(
        workout(id, wednesday, [veloBlock(1500, 10 + week * 0.1, 120)], 25, {
          sessionTemplateId: "fx-tpl-cardio",
          source: "planned",
          plannedSessionId: planId,
        }),
      );
      plan(planId, wednesday, "fx-tpl-cardio", "done", id);
    } else if (wednesday <= shiftDate(today, 7)) {
      plan(`fx-plan-c-${week}`, wednesday, "fx-tpl-cardio", "upcoming");
    }

    /* Vendredi — Muscu B : presse, pompes, curl ; sauté une semaine sur quatre. */
    if (friday <= today) {
      const planId = `fx-plan-b-${week}`;
      if (week % 4 === 3) {
        plan(planId, friday, "fx-tpl-muscu-b", "skipped");
      } else {
        const id = `fx-w-b-${week}`;
        workouts.push(
          workout(
            id,
            friday,
            [
              seriesBlock("fx-presse", 3, { kg: presseKg, reps: 10, rpe: 8 }),
              seriesBlock("fx-pompes", 3, { reps: 12 + Math.floor(week / 6) }),
              seriesBlock("fx-curl", 3, { kg: 10 + Math.floor(week / 8), reps: 12, rpe: 7 }),
            ],
            42,
            { sessionTemplateId: "fx-tpl-muscu-b", source: "planned", plannedSessionId: planId },
          ),
        );
        plan(planId, friday, "fx-tpl-muscu-b", "done", id);
      }
    } else if (friday <= shiftDate(today, 7)) {
      plan(`fx-plan-b-${week}`, friday, "fx-tpl-muscu-b", "upcoming");
    }

    /* Samedi — séance libre une semaine sur trois : mobilité avec modèle, puis sans modèle. */
    if (saturday <= today && week % 3 !== 2) {
      const withTemplate = week % 3 === 0;
      workouts.push(
        workout(
          `fx-w-s-${week}`,
          saturday,
          [seriesBlock("fx-planche", 3, { sec: 30 })],
          12,
          withTemplate ? { sessionTemplateId: "fx-tpl-mobilite" } : {},
        ),
      );
    }
  }

  return {
    today,
    coverageStart: firstMonday,
    workouts,
    plannedSessions,
    templates: establishedTemplates,
    exercises: establishedExercises,
  };
}
