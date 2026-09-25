import type {
  Exercise,
  ExerciseInstructions,
  GroupBlock,
  GroupChildInstructions,
  NumberRange,
  RangeOrValue,
  SessionStepInstruction,
  TargetRpe,
} from "../models";
import { highOf, isRange, lowOf, sumRanges } from "./rangeRules";

/* -------------------------------------------------------------------------- */
/* Formats élémentaires                                                       */
/* -------------------------------------------------------------------------- */

const frNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function formatNumberFr(value: number): string {
  return frNumber.format(value);
}

/**
 * `45 s`, `2 min`, `1 min 30`. Jamais d'heures : une séance se compte en minutes.
 */
export function formatDurationShort(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return rest === 0
    ? `${minutes} min`
    : `${minutes} min ${String(rest).padStart(2, "0")}`;
}

/**
 * `8–10`, ou `10` si les deux bornes sont égales. Tiret demi-cadratin (§8).
 */
export function formatRange(range: NumberRange | TargetRpe): string {
  return range.min === range.max
    ? String(range.min)
    : `${range.min}–${range.max}`;
}

/**
 * Durée d'une consigne, valeur ou plage (D16) : `45 s`, `20–30 s`,
 * `8–10 min`, `45 s à 1 min 30`.
 */
export function formatDurationRange(value: RangeOrValue): string {
  if (!isRange(value) || value.min === value.max) return formatDurationShort(lowOf(value));

  const { min, max } = value;
  if (max < 60) return `${min}–${max} s`;
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} min`;

  return `${formatDurationShort(min)} à ${formatDurationShort(max)}`;
}

/** `6 %`, `6–8 %`, `4,5 km/h`. */
export function formatValueRange(value: RangeOrValue, unit: string): string {
  const text =
    !isRange(value) || value.min === value.max
      ? formatNumberFr(lowOf(value))
      : `${formatNumberFr(value.min)}–${formatNumberFr(value.max)}`;

  return `${text} ${unit}`;
}

/**
 * `4,5 à 5 km/h`, ou `5 km/h` si tous les paliers partagent la valeur.
 */
function formatSpan(values: number[], unit: string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);

  return min === max
    ? `${formatNumberFr(min)} ${unit}`
    : `${formatNumberFr(min)} à ${formatNumberFr(max)} ${unit}`;
}

function formatRpe(rpe: TargetRpe | undefined): string | undefined {
  return rpe ? `RPE ${formatRange(rpe)}` : undefined;
}

function formatSets(sets: number): string {
  return sets === 1 ? "1 série" : `${sets} séries`;
}

/* -------------------------------------------------------------------------- */
/* Ligne d'identité                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `Zone · Mouvement · Équipement` pour la musculation ; les autres familles
 * n'ont pas de fausse zone (§2) et disent leur catégorie.
 */
export function formatExerciseIdentity(exercise: Exercise): string {
  if (exercise.category === "Musculation") {
    return [exercise.zone, exercise.movement, exercise.equipment].join(" · ");
  }

  if (exercise.category === "Cardio") {
    return [exercise.category, exercise.equipment, exercise.location].join(
      " · ",
    );
  }

  return [exercise.category, exercise.location].join(" · ");
}

/* -------------------------------------------------------------------------- */
/* Rangée de consignes (§6)                                                   */
/* -------------------------------------------------------------------------- */

function formatSteps(steps: SessionStepInstruction[]): string {
  if (steps.length === 0) {
    return "Paliers à définir";
  }

  const total = sumRanges(steps.map((step) => step.durationSec));
  const parts = [
    steps.length === 1 ? "1 palier" : `${steps.length} paliers`,
    formatDurationRange(total),
  ];

  /* Une plage étend l'éventail : ses deux bornes y entrent (D16). */
  const speeds = steps.flatMap((step) =>
    "speedKmh" in step ? [lowOf(step.speedKmh), highOf(step.speedKmh)] : [],
  );
  const inclines = steps.flatMap((step) =>
    "inclinePercent" in step ? [lowOf(step.inclinePercent), highOf(step.inclinePercent)] : [],
  );
  const distances = steps.flatMap((step) =>
    !("speedKmh" in step) && step.distanceKm !== undefined ? [step.distanceKm] : [],
  );

  if (speeds.length > 0) parts.push(formatSpan(speeds, "km/h"));
  if (inclines.length > 0) parts.push(formatSpan(inclines, "%"));
  if (distances.length > 0) parts.push(formatSpan(distances, "km"));

  return parts.join(" · ");
}

/**
 * Rangée de consignes d'un exercice autonome. Seul son contenu change
 * selon le type de mesure ; la structure de la carte reste la même (§6).
 */
export function formatExerciseInstructionsRow(
  instructions: ExerciseInstructions,
): string {
  switch (instructions.shape) {
    case "reps":
      return [
        formatSets(instructions.sets),
        `${formatRange(instructions.reps)} reps`,
        formatRpe(instructions.targetRpe),
        /* Une seule série : pas de repos (décision du 25/09/2026). */
        instructions.sets > 1 ? `repos ${formatDurationShort(instructions.restBetweenSetsSec)}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");

    case "duration":
      return [
        formatSets(instructions.sets),
        formatDurationRange(instructions.durationSec),
        formatRpe(instructions.targetRpe),
        instructions.sets > 1 ? `repos ${formatDurationShort(instructions.restBetweenSetsSec)}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");

    case "steps":
      return formatSteps(instructions.steps);

    case "duration_distance": {
      const parts = [
        instructions.durationSec !== undefined
          ? formatDurationShort(instructions.durationSec)
          : undefined,
        instructions.distanceKm !== undefined
          ? `${formatNumberFr(instructions.distanceKm)} km`
          : undefined,
      ].filter(Boolean);

      return parts.length > 0 ? parts.join(" · ") : "durée et distance libres";
    }

    case "distance":
      return instructions.distanceKm !== undefined
        ? `${formatNumberFr(instructions.distanceKm)} km`
        : "distance libre";

    case "distance_cm":
      return instructions.distanceCm !== undefined
        ? `${instructions.distanceCm} cm`
        : "mesure libre";

    case "distance_cm_per_side": {
      if (
        instructions.leftCm === undefined &&
        instructions.rightCm === undefined
      ) {
        return "mesure libre, par côté";
      }

      return [
        instructions.leftCm !== undefined ? `G ${instructions.leftCm} cm` : undefined,
        instructions.rightCm !== undefined ? `D ${instructions.rightCm} cm` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

/**
 * Consigne d'un palier quand elle porte une plage ou un RPE cible (D16) :
 * `35 min · 5 km/h · pente 6–8 %`, `1 min · RPE 7–8`. Absente pour un
 * palier à valeurs uniques sans RPE : ses réglages suffisent.
 */
export function formatStepPrescription(step: SessionStepInstruction): string | undefined {
  /* Palier de vélo (lot D.6 bis) : durée, distance si prescrite, RPE. */
  if (!("speedKmh" in step)) {
    if (step.targetRpe === undefined) return undefined;

    return [
      formatDurationRange(step.durationSec),
      step.distanceKm !== undefined ? `${formatNumberFr(step.distanceKm)} km` : undefined,
      formatRpe(step.targetRpe),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const ranged = isRange(step.durationSec) || isRange(step.speedKmh) || isRange(step.inclinePercent);
  if (!ranged && step.targetRpe === undefined) return undefined;

  return [
    formatDurationRange(step.durationSec),
    formatValueRange(step.speedKmh, "km/h"),
    `pente ${formatValueRange(step.inclinePercent, "%")}`,
    formatRpe(step.targetRpe),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Rangée d'un enfant de groupe : ni séries ni repos, absorbés par le groupe (§7).
 */
export function formatGroupChildInstructionsRow(
  instructions: GroupChildInstructions,
): string {
  const target =
    instructions.shape === "reps"
      ? `${formatRange(instructions.reps)} reps`
      : formatDurationRange(instructions.durationSec);

  return [target, formatRpe(instructions.targetRpe)].filter(Boolean).join(" · ");
}

/**
 * `3 tours · repos 1 min entre les tours`.
 */
export function formatGroupRow(group: GroupBlock): string {
  const rounds = group.rounds === 1 ? "1 tour" : `${group.rounds} tours`;

  return `${rounds} · repos ${formatDurationShort(group.restBetweenRoundsSec)} entre les tours`;
}

/**
 * Nom affiché d'un groupe : le sien, ou `Groupe N` (§7).
 */
export function formatGroupName(group: GroupBlock, number: string): string {
  return group.name?.trim() || `Groupe ${number}`;
}

/* -------------------------------------------------------------------------- */
/* Consignes par défaut à l'ajout d'un exercice                               */
/* -------------------------------------------------------------------------- */

/**
 * Consignes proposées quand un exercice entre dans une séance.
 * Des points de départ ordinaires, à ajuster dans `Modifier l'exercice`.
 */
export function defaultInstructionsFor(
  exercise: Exercise,
  newId: () => string,
): ExerciseInstructions {
  switch (exercise.measurementType) {
    case "load_reps":
    case "reps":
    case "reps_per_side":
      return {
        shape: "reps",
        sets: 3,
        reps: { min: 8, max: 12 },
        restBetweenSetsSec: 90,
      };

    case "reps_duration":
      return {
        shape: "reps",
        sets: 3,
        reps: { min: 3, max: 5 },
        restBetweenSetsSec: 120,
      };

    case "duration_power":
      return {
        shape: "duration",
        sets: 6,
        durationSec: 12,
        restBetweenSetsSec: 48,
      };

    case "duration":
    case "duration_per_side":
      return {
        shape: "duration",
        sets: 3,
        durationSec: 45,
        restBetweenSetsSec: 60,
      };

    case "duration_speed_incline":
      return {
        shape: "steps",
        steps: [
          {
            id: newId(),
            position: 0,
            durationSec: 600,
            speedKmh: 5,
            inclinePercent: 0,
          },
        ],
      };

    case "duration_distance":
      return exercise.mode === "steps"
        ? {
            shape: "steps",
            steps: [
              { id: newId(), position: 0, durationSec: 600, distanceKm: 1 },
            ],
          }
        : { shape: "duration_distance" };

    case "distance":
      return { shape: "distance" };

    case "distance_cm":
      return { shape: "distance_cm" };

    case "distance_cm_per_side":
      return { shape: "distance_cm_per_side" };
  }
}

/**
 * Un exercice peut rejoindre un groupe s'il se mesure en séries (§7) :
 * les paliers et les mesures simples n'ont ni tours ni repos à absorber.
 */
export function canJoinGroup(exercise: Exercise): boolean {
  /* Durée par répétition et effort en puissance : un enfant de tour ne
     porte pas ces champs (lot D). */
  return (
    exercise.mode === "series" &&
    exercise.measurementType !== "reps_duration" &&
    exercise.measurementType !== "duration_power"
  );
}

export function defaultGroupChildInstructionsFor(
  exercise: Exercise,
): GroupChildInstructions {
  switch (exercise.measurementType) {
    case "duration":
    case "duration_per_side":
      return { shape: "duration", durationSec: 45 };

    default:
      return { shape: "reps", reps: { min: 8, max: 12 } };
  }
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

const measurementTypeLabels: Record<Exercise["measurementType"], string> = {
  load_reps: "Charge + répétitions",
  reps: "Répétitions",
  reps_per_side: "Répétitions par côté",
  duration: "Durée",
  duration_per_side: "Durée par côté",
  duration_speed_incline: "Durée + vitesse + pente",
  duration_distance: "Durée + distance",
  distance: "Distance",
  distance_cm: "Distance en cm",
  distance_cm_per_side: "Distance en cm par côté",
  reps_duration: "Répétitions + durée de chaque répétition",
  duration_power: "Durée + puissance ou distance",
};

export function formatMeasurementType(exercise: Exercise): string {
  return measurementTypeLabels[exercise.measurementType];
}

const modeLabels: Record<Exercise["mode"], string> = {
  series: "séries",
  steps: "paliers",
  simple: "mesure simple",
};

export function formatMode(exercise: Exercise): string {
  return modeLabels[exercise.mode];
}
