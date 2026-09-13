export type Id = string;

export type MuscleZone =
  | "Jambes"
  | "Dos"
  | "Pecs"
  | "Épaules"
  | "Bras"
  | "Core";

export type Movement =
  | "Tirage"
  | "Poussée"
  | "Squat"
  | "Charnière"
  | "Isolation"
  | "Gainage";

export type Equipment =
  | "Machine"
  | "Poulie"
  | "Barre"
  | "Haltères"
  | "Poids du corps"
  | "Élastique";

export type ExerciseLocation =
  | "Salle"
  | "Maison";

export type ExerciseMode =
  | "series"
  | "steps"
  | "simple";

/**
 * Le type de mesure appartient uniquement à l'exercice.
 *
 * Durée/côté et répétitions/côté utilisent la même structure
 * de saisie (valeur + côté), mais restent deux types distincts
 * car leurs métriques de progression sont différentes.
 */
export type MeasurementType =
  | "load_reps"
  | "reps"
  | "duration"
  | "duration_per_side"
  | "reps_per_side"
  | "duration_speed_incline"
  | "duration_distance"
  | "distance";

export type SpeedDisplay =
  | "speed_kmh"
  | "pace_min_km"
  | "pace_min_500m";

export type ExerciseStatus =
  | "active"
  | "archived";

export interface ExerciseMedia {
  photoUrl?: string;
  videoUrl?: string;
}

/**
 * Les combinaisons mode + type de mesure autorisées.
 *
 * Le mode est déterminé par le type de mesure,
 * sauf "duration_distance" qui peut être réalisé
 * en paliers ou en mesure simple.
 *
 * speedDisplay n'existe que pour "duration_distance".
 */
export type ExerciseMeasurement =
  | {
      mode: "series";
      measurementType:
        | "load_reps"
        | "reps"
        | "duration"
        | "duration_per_side"
        | "reps_per_side";
      speedDisplay?: never;
    }
  | {
      mode: "steps";
      measurementType: "duration_speed_incline";
      speedDisplay?: never;
    }
  | {
      mode: "steps" | "simple";
      measurementType: "duration_distance";
      speedDisplay?: SpeedDisplay;
    }
  | {
      mode: "simple";
      measurementType: "distance";
      speedDisplay?: never;
    };

interface ExerciseBase {
  id: Id;

  name: string;

  zone: MuscleZone;
  movement: Movement;
  equipment: Equipment;
  location: ExerciseLocation;

  media?: ExerciseMedia;

  technique?: string;
  description?: string;
  advice?: string;
  muscles?: string[];

  /**
   * Les alternatives automatiques sont calculées
   * depuis zone + mouvement avec un équipement différent.
   *
   * On ne stocke ici que les épinglages manuels.
   */
  pinnedAlternativeExerciseIds?: Id[];

  status: ExerciseStatus;

  createdAt: string;
  updatedAt: string;
}

export type Exercise =
  ExerciseBase &
  ExerciseMeasurement;

/**
 * Une charge est une valeur structurée.
 *
 * Exemples :
 * - 40 kg au total
 * - barre à vide
 * - 5 kg par côté
 */
export type Load =
  | {
      kind: "total";
      kg: number;
    }
  | {
      kind: "empty";
      /**
       * Tare connue de l'équipement.
       * Peut rester absente.
       */
      tareKg?: number;
    }
  | {
      kind: "per_side";
      kgPerSide: number;
      /**
       * Tare éventuelle de la barre ou de la machine.
       */
      tareKg?: number;
    };
