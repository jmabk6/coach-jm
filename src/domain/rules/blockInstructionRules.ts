import type {
  Exercise,
  ExerciseInstructions,
  GroupBlock,
  GroupChildInstructions,
  NumberRange,
  SessionStepInstruction,
  TargetRpe,
} from "../models";

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

  const totalSec = steps.reduce((sum, step) => sum + step.durationSec, 0);
  const parts = [
    steps.length === 1 ? "1 palier" : `${steps.length} paliers`,
    formatDurationShort(totalSec),
  ];

  const speeds = steps.flatMap((step) =>
    "speedKmh" in step ? [step.speedKmh] : [],
  );
  const inclines = steps.flatMap((step) =>
    "inclinePercent" in step ? [step.inclinePercent] : [],
  );
  const distances = steps.flatMap((step) =>
    "distanceKm" in step ? [step.distanceKm] : [],
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
        `repos ${formatDurationShort(instructions.restBetweenSetsSec)}`,
      ]
        .filter(Boolean)
        .join(" · ");

    case "duration":
      return [
        formatSets(instructions.sets),
        formatDurationShort(instructions.durationSec),
        formatRpe(instructions.targetRpe),
        `repos ${formatDurationShort(instructions.restBetweenSetsSec)}`,
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
 * Rangée d'un enfant de groupe : ni séries ni repos, absorbés par le groupe (§7).
 */
export function formatGroupChildInstructionsRow(
  instructions: GroupChildInstructions,
): string {
  const target =
    instructions.shape === "reps"
      ? `${formatRange(instructions.reps)} reps`
      : formatDurationShort(instructions.durationSec);

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
  return exercise.mode === "series";
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
