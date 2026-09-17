/**
 * Arrondi à l'unité **symétrique** (demi vers l'extérieur) : `+3,5 → +4`
 * et `−3,5 → −4`. `Math.round` arrondirait `−3,5` à `−3`, ce qui
 * classerait une baisse de 3,5 % comme stable alors qu'une hausse de
 * 3,5 % serait une progression. Tous les pourcentages de Progression
 * passent par ici, affichage et classement compris.
 */
export function roundPercent(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));

  return Object.is(rounded, -0) ? 0 : rounded;
}
