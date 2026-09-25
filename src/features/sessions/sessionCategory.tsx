import { Dumbbell, HeartPulse, MoonStar, PersonStanding } from "lucide-react";
import type { SessionCategory } from "../../domain";

const icons = {
  Musculation: Dumbbell,
  Cardio: HeartPulse,
  Mobilité: PersonStanding,
  Routine: MoonStar,
} satisfies Record<SessionCategory, typeof Dumbbell>;

interface SessionCategoryIconProps {
  category: SessionCategory;
  size?: number;
}

/**
 * Icône de catégorie, toujours accompagnée de son étiquette ou d'une couleur
 * de fond par catégorie : l'icône seule ne porte jamais l'information.
 */
export function SessionCategoryIcon({
  category,
  size = 20,
}: SessionCategoryIconProps) {
  const Icon = icons[category];

  return <Icon size={size} strokeWidth={2} aria-hidden="true" />;
}
