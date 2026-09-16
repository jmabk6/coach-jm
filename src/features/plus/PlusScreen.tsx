import { Link } from "react-router-dom";
import { Dumbbell, ListChecks } from "lucide-react";
import "./PlusScreen.css";

/**
 * Écran Plus : réglages et outils secondaires.
 * Séances et bibliothèque d'exercices s'ouvrent d'ici (§18 : Plus = gestion).
 */
export function PlusScreen() {
  return (
    <section className="plus-screen">
      <header className="plus-screen__header">
        <h1>Plus</h1>
        <p>Outils et réglages de Coach JM.</p>
      </header>

      <nav className="plus-list" aria-label="Outils">
        <Link to="/sessions" className="plus-list__item">
          <span className="plus-list__icon" aria-hidden="true">
            <ListChecks size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Séances</span>
            <span className="plus-list__meta">
              Modèles de séance, briques et groupes
            </span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </Link>

        <Link to="/exercises" className="plus-list__item">
          <span className="plus-list__icon" aria-hidden="true">
            <Dumbbell size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Exercices</span>
            <span className="plus-list__meta">
              Bibliothèque, fiches et création d'exercices
            </span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </Link>
      </nav>
    </section>
  );
}
