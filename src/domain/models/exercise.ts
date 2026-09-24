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
  | "distance_cm_per_side"
  /** Répétitions + durée de chaque répétition (traction négative, D25). */
  | "reps_duration"
  /** Durée + résultat en watts ou en mètres + résistance (sprints vélo, D17). */
  | "duration_power";

/** Unité du résultat d'un effort `duration_power` (D17). */
export type PowerUnit = "watts" | "meters";

export type SpeedDisplay =
  | "speed_kmh"
  | "pace_min_km"
  | "pace_min_500m";

export type ExerciseStatus =
  | "active"
  | "archived";

/**
 * Groupe de progression (conception technique v1.5, § 2.1) : le
 * sous-ensemble suivi par le module Musculation. Sa cohérence avec
 * `zone` (Jambes → Quadriceps / Ischio-jambiers / Fessiers, Dos → Dos,
 * Pecs → Pectoraux, Épaules → Épaules, Bras → Bras, Core → Abdominaux,
 * zone absente → aucun) sera validée par `domain/rules/exerciseRules.ts`
 * dans un lot ultérieur ; ici le type seul.
 */
export type ProgressionGroup =
  | "Quadriceps"
  | "Ischio-jambiers"
  | "Fessiers"
  | "Dos"
  | "Pectoraux"
  | "Épaules"
  | "Bras"
  | "Abdominaux";

/**
 * Famille de mouvement, indépendante de `movement` : un Tirage peut être
 * horizontal ou vertical, aucune dérivation automatique. Vide est une
 * valeur normale (squats, jambes, gainage, isolations).
 */
export type MovementFamily =
  | "tirage_horizontal"
  | "tirage_vertical"
  | "poussee_horizontale"
  | "poussee_verticale";

/**
 * Sens de la charge saisie (lot a, 23/09/2026) : `external` = une charge
 * que l'on soulève (plus lourd = plus difficile) ; `assistance` = un
 * contrepoids qui aide (traction assistée, dips assistés : moins
 * d'assistance = plus difficile). Absent = `external`.
 *
 * Une assistance n'entre dans aucun volume, sa meilleure valeur est la
 * plus basse, et sa tendance progresse quand elle baisse. Lue par
 * `domain/rules/loadSemanticsRules.ts`, jamais interprétée ailleurs.
 */
export type LoadSemantics =
  | "external"
  | "assistance";

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
        | "reps_per_side"
        | "reps_duration"
        | "duration_power";
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

  /**
   * Classification de progression (v1.5, § 2.1), facultative : absente
   * sur tous les enregistrements antérieurs au schéma v2 et sur les
   * exercices créés par l'utilisateur tant qu'il ne l'a pas saisie.
   * Un exercice sans `progressionGroup` n'entre dans aucun total par
   * groupe. Renseignée par le catalogue dans un lot ultérieur.
   */
  progressionGroup?: ProgressionGroup;
  movementFamily?: MovementFamily;

  /**
   * Sens de la charge, facultatif et non indexé : absent = `external`.
   * Complété par le seed du catalogue s'il est absent, jamais écrasé.
   */
  loadSemantics?: LoadSemantics;

  /**
   * `duration_power` seulement (D17) : unité du résultat, **fixée à la
   * première saisie** puis imposée. Changer de machine ou d'unité passe
   * par un nouvel exercice. Absente tant que rien n'a été saisi.
   */
  powerUnit?: PowerUnit;

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