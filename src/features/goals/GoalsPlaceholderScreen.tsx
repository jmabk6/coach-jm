import "./GoalsPlaceholderScreen.css";

/**
 * Onglet Objectifs, provisoire (lot B) : aucune donnée, aucun chiffre.
 * Les sept objectifs, leurs tests et leurs courbes arrivent au lot H
 * (conception V2 § 2.2, maquettes M4 à M7).
 */
export function GoalsPlaceholderScreen() {
  return (
    <section className="goals-placeholder">
      <h1>Objectifs</h1>
      <p>Les objectifs arrivent bientôt : suivi par tests, trajectoire et conseils.</p>
    </section>
  );
}
