import type {
  Equipment,
  Exercise,
  ExerciseCategory,
  ExerciseLocation,
  MeasurementType,
  Movement,
  MuscleZone,
} from "../../domain";

/**
 * Fabrique un exercice à partir des champs du formulaire : la
 * classification suit la famille (§2), le mode découle du type de mesure
 * sauf pour `Durée + distance` qui garde son choix.
 */
export type DurationDistanceMode =
  | "steps"
  | "simple";

export function buildExercise(
  id: string,
  name: string,
  category: ExerciseCategory,
  zone: MuscleZone,
  movement: Movement,
  equipment: Equipment,
  location: ExerciseLocation,
  measurementType: MeasurementType,
  durationDistanceMode: DurationDistanceMode,
): Exercise {
  const now = new Date().toISOString();

  const commonBase = {
    id,
    name,
    location,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };

  const base =
    category === "Musculation"
      ? {
          ...commonBase,
          category,
          zone,
          movement,
          equipment,
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
        speedDisplay: "speed_kmh",
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

