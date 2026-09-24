import {
  BicepsFlexed,
  Footprints,
  HeartPulse,
  MoveVertical,
  Scale,
  Shield,
  Shirt,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { Goal } from "../../domain";

/** Icônes Lucide des objectifs (D4), par leur nom stocké. */
const ICONS: Record<string, LucideIcon> = {
  "biceps-flexed": BicepsFlexed,
  shirt: Shirt,
  footprints: Footprints,
  "heart-pulse": HeartPulse,
  shield: Shield,
  "move-vertical": MoveVertical,
  scale: Scale,
};

/** Teinte de la vignette et du numéro, comme la maquette M4. */
const TONES: Record<Goal["key"], string> = {
  traction: "rose",
  upper_body: "blue",
  legs: "violet",
  cardio: "green",
  core: "orange",
  flexibility: "violet",
  weight: "sky",
};

export function goalIcon(goal: Pick<Goal, "icon">): LucideIcon {
  return ICONS[goal.icon] ?? Target;
}

export function goalTone(goal: Pick<Goal, "key">): string {
  return TONES[goal.key] ?? "blue";
}
