import type { Exercise, MovementFamily, MuscleZone, ProgressionGroup } from "../models";

/**
 * Classification de progression d'un exercice (conception v1.5, § 2.1 et
 * § 8) — la règle unique.
 *
 * - `progressionGroup` doit être cohérent avec `zone` selon la table
 *   ci-dessous ; une combinaison hors table est **refusée** à la création
 *   et à l'édition, seulement **signalée** par le seed (jamais corrigée).
 * - `movementFamily` est indépendante de `movement` et ne se dérive
 *   jamais ; une famille inattendue pour le mouvement déclaré donne un
 *   **avertissement non bloquant** (décision du 20/09/2026).
 * - Vide est une valeur normale pour les deux champs.
 */

export const PROGRESSION_GROUPS_BY_ZONE: Record<MuscleZone, ProgressionGroup[]> = {
  Jambes: ["Quadriceps", "Ischio-jambiers", "Fessiers"],
  Dos: ["Dos"],
  Pecs: ["Pectoraux"],
  Épaules: ["Épaules"],
  Bras: ["Bras"],
  Core: ["Abdominaux"],
};

export const MOVEMENT_FAMILIES: MovementFamily[] = [
  "tirage_horizontal",
  "tirage_vertical",
  "poussee_horizontale",
  "poussee_verticale",
];

export const movementFamilyLabels: Record<MovementFamily, string> = {
  tirage_horizontal: "Tirage horizontal",
  tirage_vertical: "Tirage vertical",
  poussee_horizontale: "Poussée horizontale",
  poussee_verticale: "Poussée verticale",
};

export function allowedProgressionGroups(zone: MuscleZone | undefined): ProgressionGroup[] {
  return zone ? PROGRESSION_GROUPS_BY_ZONE[zone] : [];
}

export interface ClassificationIssue {
  /** `error` : refusé à la saisie ; `warning` : affiché, jamais bloquant. */
  severity: "error" | "warning";
  message: string;
}

type Classifiable = Pick<Exercise, "category" | "zone" | "movement" | "progressionGroup" | "movementFamily">;

/**
 * Toutes les anomalies de classification d'un exercice, erreurs puis
 * avertissements. Vide = rien à dire.
 */
export function checkClassification(exercise: Classifiable): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const { category, zone, movement, progressionGroup, movementFamily } = exercise;

  if (progressionGroup !== undefined) {
    if (zone === undefined) {
      issues.push({
        severity: "error",
        message: `Le groupe de progression « ${progressionGroup} » suppose une zone musculaire : un exercice ${category} n'en a pas.`,
      });
    } else if (!PROGRESSION_GROUPS_BY_ZONE[zone].includes(progressionGroup)) {
      issues.push({
        severity: "error",
        message: `Le groupe « ${progressionGroup} » n'appartient pas à la zone ${zone} (attendu : ${PROGRESSION_GROUPS_BY_ZONE[zone].join(", ")}).`,
      });
    }
  }

  if (movementFamily !== undefined) {
    if (category !== "Musculation") {
      issues.push({
        severity: "error",
        message: `Une famille de mouvement ne concerne que la musculation, pas un exercice ${category}.`,
      });
    } else if (movement !== undefined) {
      const family = movementFamilyLabels[movementFamily];
      const isPull = movementFamily.startsWith("tirage");
      const isPush = movementFamily.startsWith("poussee");

      if ((movement === "Tirage" && isPush) || (movement === "Poussée" && isPull)) {
        issues.push({
          severity: "warning",
          message: `Famille « ${family} » inhabituelle pour un mouvement ${movement} : à vérifier.`,
        });
      } else if (movement !== "Tirage" && movement !== "Poussée") {
        issues.push({
          severity: "warning",
          message: `Famille « ${family} » inhabituelle pour un mouvement ${movement} : les squats, charnières, isolations et gainages n'en ont normalement pas.`,
        });
      }
    }
  }

  return issues;
}

export function isClassificationValid(exercise: Classifiable): boolean {
  return checkClassification(exercise).every((issue) => issue.severity !== "error");
}

export function classificationErrors(exercise: Classifiable): string[] {
  return checkClassification(exercise)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

export function classificationWarnings(exercise: Classifiable): string[] {
  return checkClassification(exercise)
    .filter((issue) => issue.severity === "warning")
    .map((issue) => issue.message);
}

/** `Quadriceps · Poussée verticale`, `Dos`, ou `undefined` si rien n'est renseigné. */
export function formatClassification(exercise: Pick<Exercise, "progressionGroup" | "movementFamily">): string | undefined {
  const parts = [
    exercise.progressionGroup,
    exercise.movementFamily ? movementFamilyLabels[exercise.movementFamily] : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
