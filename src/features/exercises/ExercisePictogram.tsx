import {
  Activity,
  CircleDot,
  Dumbbell,
  Footprints,
  HeartPulse,
  Move,
  PersonStanding,
  Ruler,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { Exercise } from "../../domain";
import "./ExercisePictogram.css";

interface ExercisePictogramProps {
  exercise: Exercise;
}

function getExercisePictogram(exercise: Exercise): {
  Icon: LucideIcon;
  label: string;
} {
  if (exercise.category === "Cardio") {
    return {
      Icon: HeartPulse,
      label: "Cardio",
    };
  }

  if (exercise.category === "Mobilité") {
    return {
      Icon: Move,
      label: "Mobilité",
    };
  }

  if (exercise.category === "Test mobilité") {
    return {
      Icon: Ruler,
      label: "Test mobilité",
    };
  }

  switch (exercise.zone) {
    case "Jambes":
      return {
        Icon: Footprints,
        label: "Jambes",
      };

    case "Dos":
      return {
        Icon: PersonStanding,
        label: "Dos",
      };

    case "Pecs":
      return {
        Icon: Target,
        label: "Pectoraux",
      };

    case "Épaules":
      return {
        Icon: Activity,
        label: "Épaules",
      };

    case "Bras":
      return {
        Icon: Dumbbell,
        label: "Bras",
      };

    case "Core":
      return {
        Icon: CircleDot,
        label: "Core",
      };
  }

  return {
    Icon: Dumbbell,
    label: "Musculation",
  };
}

/**
 * Vignette d'icône Lucide sur fond teinté : base commune des pictogrammes
 * d'exercice et des icônes d'objectif (lot H.3).
 */
export function PictogramTile({
  Icon,
  label,
  tone,
  size = 30,
}: {
  Icon: LucideIcon;
  label: string;
  tone: string;
  size?: number;
}) {
  return (
    <span className={`exercise-pictogram exercise-pictogram--${tone}`} title={label}>
      <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}

export function ExercisePictogram({
  exercise,
}: ExercisePictogramProps) {
  const { Icon, label } = getExercisePictogram(exercise);

  const categoryClass =
    typeof exercise.category === "string"
      ? exercise.category
          .toLowerCase()
          .replace(/\s+/g, "-")
      : "musculation";

  return <PictogramTile Icon={Icon} label={label} tone={categoryClass} />;
}
