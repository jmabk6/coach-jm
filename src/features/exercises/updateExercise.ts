import type {
  Equipment,
  Exercise,
  ExerciseCategory,
  ExerciseLocation,
  MeasurementType,
  Movement,
  MovementFamily,
  MuscleZone,
  ProgressionGroup,
} from "../../domain";
import { classificationErrors } from "../../domain/rules/exerciseRules";

export type DurationDistanceMode =
  | "steps"
  | "simple";

export function getDurationDistanceMode(
  exercise: Exercise,
): DurationDistanceMode {
  if (
    exercise.measurementType === "duration_distance" &&
    exercise.mode === "simple"
  ) {
    return "simple";
  }

  return "steps";
}

/**
 * Recompose l'exercice modifié depuis les champs du formulaire. Les champs
 * que le formulaire ne montre pas sont **conservés** : sens de la charge
 * (`loadSemantics`, lot a), unité fixée (`powerUnit`, D17), libellés de
 * mesure hors cm (« pas », lot D). Les perdre ici effacerait un choix que
 * rien ne rétablit pour un exercice créé par l'utilisateur.
 */
export function updateExercise(
  current: Exercise,
  name: string,
  category: ExerciseCategory,
  zone: MuscleZone,
  movement: Movement,
  equipment: Equipment,
  location: ExerciseLocation,
  measurementType: MeasurementType,
  durationDistanceMode: DurationDistanceMode,
  photoUrl: string,
  videoUrl: string,
  technique: string,
  description: string,
  musclesText: string,
  advice: string,
  pinnedAlternativeIds: string[],
  measurementLabelValue: string,
  measurementLabelLeft: string,
  measurementLabelRight: string,
  progressionGroup: ProgressionGroup | undefined,
  movementFamily: MovementFamily | undefined,
): Exercise {
  if (category === "Musculation") {
    const errors = classificationErrors({
      category,
      zone,
      movement,
      ...(progressionGroup !== undefined ? { progressionGroup } : {}),
      ...(movementFamily !== undefined ? { movementFamily } : {}),
    });
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
  }

  const commonBase = {
    id: current.id,
    name,
    location,
    status: current.status,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),

    ...(photoUrl.trim() || videoUrl.trim()
      ? {
          media: {
            ...(photoUrl.trim()
              ? { photoUrl: photoUrl.trim() }
              : {}),
            ...(videoUrl.trim()
              ? { videoUrl: videoUrl.trim() }
              : {}),
          },
        }
      : {}),

    ...(technique.trim()
      ? { technique: technique.trim() }
      : {}),

    ...(description.trim()
      ? { description: description.trim() }
      : {}),

    ...(advice.trim()
      ? { advice: advice.trim() }
      : {}),

    ...(musclesText.trim()
      ? {
          muscles: musclesText
            .split(",")
            .map((muscle: string) => muscle.trim())
            .filter(Boolean),
        }
      : {}),

    ...(measurementType === "distance_cm" &&
    measurementLabelValue.trim()
      ? {
          measurementLabels: {
            value: measurementLabelValue.trim(),
          },
        }
      : measurementType === "distance_cm_per_side" &&
          (measurementLabelLeft.trim() ||
            measurementLabelRight.trim())
        ? {
            measurementLabels: {
              ...(measurementLabelLeft.trim()
                ? {
                    left:
                      measurementLabelLeft.trim(),
                  }
                : {}),
              ...(measurementLabelRight.trim()
                ? {
                    right:
                      measurementLabelRight.trim(),
                  }
                : {}),
            },
          }
        : /* Libellés hors cm (« pas ») : conservés si la mesure ne change pas. */
          measurementType !== "distance_cm" &&
            measurementType !== "distance_cm_per_side" &&
            measurementType === current.measurementType &&
            current.measurementLabels !== undefined
          ? { measurementLabels: current.measurementLabels }
          : {}),

    /* Sens de la charge (lot a) : conservé tant que la mesure reste une charge. */
    ...(measurementType === "load_reps" && current.loadSemantics !== undefined
      ? { loadSemantics: current.loadSemantics }
      : {}),
    ...(pinnedAlternativeIds.length > 0
      ? {
          pinnedAlternativeExerciseIds:
            pinnedAlternativeIds,
        }
      : {}),

    /* Unité fixée à la première saisie (D17) : conservée tant que la
       mesure reste `duration_power`. */
    ...(measurementType === "duration_power" &&
    current.powerUnit !== undefined
      ? { powerUnit: current.powerUnit }
      : {}),
  };

  const base =
    category === "Musculation"
      ? {
          ...commonBase,
          category,
          zone,
          movement,
          equipment,
          ...(progressionGroup !== undefined ? { progressionGroup } : {}),
          ...(movementFamily !== undefined ? { movementFamily } : {}),
        }
      : category === "Cardio"
        ? {
            ...commonBase,
            category,
            equipment,
          }
        : {
            ...commonBase,
            category,
          };

  switch (measurementType) {
    case "load_reps":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "reps":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "duration":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "duration_per_side":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "reps_per_side":
    case "reps_duration":
    case "duration_power":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "duration_speed_incline":
      return {
        ...base,
        mode: "steps",
        measurementType,
      };

    case "duration_distance":
      return {
        ...base,
        mode: durationDistanceMode,
        measurementType,
        speedDisplay:
          current.measurementType === "duration_distance"
            ? (current.speedDisplay ?? "speed_kmh")
            : "speed_kmh",
      };

    case "distance":
    case "distance_cm":
    case "distance_cm_per_side":
      return {
        ...base,
        mode: "simple",
        measurementType,
      };
  }
}
