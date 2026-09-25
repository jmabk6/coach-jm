import { ChevronLeft, Info, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import type { SessionTemplate } from "../../domain";
import "./PlusScreen.css";

/**
 * Plus > Routines du soir (M11, lot L.5) : les trois routines A, B, C, qui
 * s'ouvrent dans Séances pour être lues ou modifiées.
 */
export function RoutinesScreen() {
  const [routines, setRoutines] = useState<SessionTemplate[]>();

  useEffect(() => {
    let cancelled = false;
    void getAllSessionTemplates().then((templates) => {
      if (cancelled) return;
      setRoutines(
        templates
          .filter((template) => template.category === "Routine" && template.status === "active")
          .sort((a, b) => (a.letter ?? a.name).localeCompare(b.letter ?? b.name)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="plus-screen">
      <header className="plus-subscreen__nav">
        <Link to={paths.plus()} className="plus-subscreen__back">
          <ChevronLeft size={18} aria-hidden="true" /> Plus
        </Link>
        <h1>Routines du soir</h1>
        <span />
      </header>

      {routines === undefined ? (
        <p>Chargement…</p>
      ) : (
        <nav className="plus-list" aria-label="Routines du soir">
          {routines.map((routine) => {
            const exercises = routine.blocks.filter((block) => block.kind !== "note").length;
            return (
              <Link key={routine.id} to={paths.session(routine.id)} className="plus-list__item">
                <span className="plus-list__icon" aria-hidden="true">
                  <Moon size={22} strokeWidth={2} />
                </span>
                <span className="plus-list__content">
                  <span className="plus-list__title">{routine.name}</span>
                  <span className="plus-list__meta">
                    {exercises === 0
                      ? "Contenu à définir"
                      : `${exercises} exercice${exercises > 1 ? "s" : ""}${routine.description ? ` · ${routine.description.replace(/\.$/, "")}` : ""}`}
                  </span>
                </span>
                <span className="plus-list__chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <p className="plus-note">
        <Info size={18} aria-hidden="true" />
        <span>
          Une routine chaque soir, en rotation A → B → C. Le lundi d'une semaine de tests, la Souplesse et le Tronc
          prennent sa place.
        </span>
      </p>
    </section>
  );
}
