export type Id = string;

export type ExerciseCategory =
  | "Musculation"
  | "Cardio"
  | "Mobilité"
  | "Test mobilité";

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
  | "Élastique"
  | "Tapis"
  | "Vélo"
  | "Vélo elliptique"
  | "Rameur";

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
 *
 * Les distances cardio restent exprimées en kilomètres.
 * Les tests de mobilité utilisent explicitement les centimètres.
 */
export type MeasurementType =
  | "load_reps"
  | "reps"
  | "duration"
  | "duration_per_side"
  | "reps_per_side"
  | "duration_speed_incline"
  | "duration_distance"
  | "distance"
  | "distance_cm"
  | "distance_cm_per_side";

export type SpeedDisplay =
  | "speed_kmh"
  | "pace_min_km"
  | "pace_min_500m";

export type ExerciseStatus =
  | "active"
  | "archived";

export interface ExerciseMeasurementLabels {
  /**
   * Libellé d'une mesure simple.
   * Exemple : "Distance doigts-sol".
   */
  value?: string;

  /**
   * Libellés des deux valeurs lorsque la mesure
   * est enregistrée par côté ou configuration.
   *
   * Exemples :
   * - "Genou gauche" / "Genou droit"
   * - "Bras gauche en haut" / "Bras droit en haut"
   */
  left?: string;
  right?: string;
}
export interface ExerciseMedia {
  thumbnailUrl?: string;
  photoUrl?: string;
  /**
   * Poses successives du mouvement (même cadre), jouées en boucle
   * aller-retour dans la fiche. Facultatif : la photo reste le repli.
   */
  animationFrameUrls?: string[];
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
 *
 * Les tests de mobilité en centimètres sont des mesures simples.
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
      measurementType:
        | "distance"
        | "distance_cm"
        | "distance_cm_per_side";
      speedDisplay?: never;
    };

interface ExerciseBase {
  id: Id;

  name: string;

  category: ExerciseCategory;
  location: ExerciseLocation;

  media?: ExerciseMedia;

  measurementLabels?: ExerciseMeasurementLabels;

  technique?: string;
  description?: string;
  advice?: string;
  muscles?: string[];

  /**
   * On ne stocke ici que les épinglages manuels.
   *
   * Les alternatives automatiques ne pourront être calculées
   * par zone + mouvement + équipement que lorsque ces propriétés
   * existent réellement sur l'exercice.
   */
  pinnedAlternativeExerciseIds?: Id[];

  status: ExerciseStatus;

  createdAt: string;
  updatedAt: string;
}

/**
 * La classification dépend de la famille d'exercice.
 *
 * Musculation :
 * zone + mouvement + équipement obligatoires.
 *
 * Cardio :
 * équipement obligatoire, aucune fausse zone ou faux mouvement musculaire.
 *
 * Mobilité et Test mobilité :
 * équipement facultatif, aucune fausse zone ou faux mouvement musculaire.
 */
export type ExerciseClassification =
  | {
      category: "Musculation";
      zone: MuscleZone;
      movement: Movement;
      equipment: Equipment;
    }
  | {
      category: "Cardio";
      zone?: never;
      movement?: never;
      equipment: Equipment;
    }
  | {
      category: "Mobilité" | "Test mobilité";
      zone?: never;
      movement?: never;
      equipment?: Equipment;
    };

export type Exercise =
  Omit<ExerciseBase, "category"> &
  ExerciseClassification &
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