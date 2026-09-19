import type { Movement, MovementFamily, MuscleZone, ProgressionGroup } from "../../domain";
import {
  allowedProgressionGroups,
  classificationWarnings,
  MOVEMENT_FAMILIES,
  movementFamilyLabels,
} from "../../domain/rules/exerciseRules";

interface ProgressionClassificationFieldsProps {
  zone: MuscleZone;
  movement: Movement;
  progressionGroup: ProgressionGroup | undefined;
  movementFamily: MovementFamily | undefined;
  onProgressionGroupChange: (value: ProgressionGroup | undefined) => void;
  onMovementFamilyChange: (value: MovementFamily | undefined) => void;
}

const NONE = "";

/**
 * Classification de progression d'un exercice de musculation (v1.5,
 * § 2.1) : deux champs facultatifs. Les groupes proposés dépendent de la
 * zone ; une famille inhabituelle pour le mouvement déclaré donne un
 * avertissement, jamais un blocage (décision du 20/09/2026).
 */
export function ProgressionClassificationFields({
  zone,
  movement,
  progressionGroup,
  movementFamily,
  onProgressionGroupChange,
  onMovementFamilyChange,
}: ProgressionClassificationFieldsProps) {
  const groups = allowedProgressionGroups(zone);
  const warnings = classificationWarnings({
    category: "Musculation",
    zone,
    movement,
    ...(progressionGroup !== undefined ? { progressionGroup } : {}),
    ...(movementFamily !== undefined ? { movementFamily } : {}),
  });

  return (
    <>
      <label className="exercise-create__field">
        <span>Groupe de progression</span>
        <select
          value={progressionGroup ?? NONE}
          onChange={(event) =>
            onProgressionGroupChange(
              event.target.value === NONE ? undefined : (event.target.value as ProgressionGroup),
            )
          }
        >
          <option value={NONE}>Aucun</option>
          {groups.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="exercise-create__field">
        <span>Famille de mouvement</span>
        <select
          value={movementFamily ?? NONE}
          onChange={(event) =>
            onMovementFamilyChange(
              event.target.value === NONE ? undefined : (event.target.value as MovementFamily),
            )
          }
        >
          <option value={NONE}>Aucune</option>
          {MOVEMENT_FAMILIES.map((value) => (
            <option key={value} value={value}>
              {movementFamilyLabels[value]}
            </option>
          ))}
        </select>
      </label>

      {warnings.length > 0 && (
        <p className="exercise-create__warning" role="status">
          {warnings.join(" ")}
        </p>
      )}
    </>
  );
}
