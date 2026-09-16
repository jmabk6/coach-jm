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

  return (
    <span
      className={`exercise-pictogram exercise-pictogram--${categoryClass}`}
      title={label}
    >
      <Icon
        size={30}
        strokeWidth={1.8}
        aria-hidden="true"
      />
    </span>
  );
}