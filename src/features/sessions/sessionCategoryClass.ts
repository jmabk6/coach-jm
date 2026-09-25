import type { SessionCategory } from "../../domain";

/**
 * Suffixe de classe CSS par catégorie : un nom sans espace ni accent, pour
 * que `session-card__icon--mobilite` ne dépende pas du libellé affiché.
 * Exhaustif : le compilateur refuse une catégorie sans classe.
 */
const classNames = {
  Musculation: "musculation",
  Cardio: "cardio",
  Mobilité: "mobilite",
  Routine: "routine",
} satisfies Record<SessionCategory, string>;

export function categoryClassName(prefix: string, category: SessionCategory): string {
  return `${prefix}--${classNames[category]}`;
}
