import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getInProgressWorkout } from "../../db/repositories/workoutRepository";
import type { WorkoutSession } from "../../domain";
import { paths } from "../../app/paths";
import { WorkoutRecapScreen } from "./WorkoutRecapScreen";

/**
 * Écran de fin (M10, `/seance-en-cours/fin`) : la séance terminée, pas
 * encore enregistrée. Sans séance en attente, il renvoie à l'accueil.
 */
export function WorkoutEndScreen() {
  const [workout, setWorkout] = useState<WorkoutSession | null>();

  useEffect(() => {
    let cancelled = false;

    void getInProgressWorkout().then((found) => {
      if (!cancelled) setWorkout(found && found.endedAt !== undefined ? found : null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (workout === undefined) {
    return (
      <section className="recap">
        <p className="recap__message">Chargement de la séance…</p>
      </section>
    );
  }

  if (workout === null) {
    return (
      <section className="recap">
        <Link to={paths.home()} className="recap__back">‹ Accueil</Link>
        <p className="recap__message">Aucune séance en attente d'enregistrement.</p>
      </section>
    );
  }

  return <WorkoutRecapScreen workoutId={workout.id} />;
}
