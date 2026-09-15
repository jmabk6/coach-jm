import { useEffect, useState } from "react";
import type { Exercise } from "../../domain";
import "./ExerciseDemonstration.css";

interface ExerciseDemonstrationProps {
  exercise: Exercise;
}

/** Durée d'affichage d'une pose avant de passer à la suivante. */
const FRAME_DURATION_MS = 800;

/**
 * Bloc « Photo / démonstration » de la fiche.
 *
 * Avec des poses d'animation, elles sont enchaînées en boucle aller-retour
 * (1 → 2 → 3 → 2 → 1…) avec un fondu, comme dans les apps de fitness.
 * Sans poses, la photo fixe ; sans photo, un emplacement neutre.
 * Si l'utilisateur a demandé moins de mouvement au système, la première
 * pose reste affichée.
 */
export function ExerciseDemonstration({
  exercise,
}: ExerciseDemonstrationProps) {
  const frames = exercise.media?.animationFrameUrls ?? [];
  const photoUrl = exercise.media?.photoUrl;

  if (frames.length >= 2) {
    return <FrameLoop frames={frames} name={exercise.name} />;
  }

  if (photoUrl !== undefined) {
    return (
      <div className="exercise-demonstration">
        <img src={photoUrl} alt={exercise.name} />
      </div>
    );
  }

  return (
    <div className="exercise-demonstration exercise-demonstration--placeholder">
      <span>{exercise.name.slice(0, 1).toUpperCase()}</span>
      <small>Photo / démonstration</small>
    </div>
  );
}

function FrameLoop({
  frames,
  name,
}: {
  frames: string[];
  name: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    /* Aller-retour : 0,1,…,n-1,n-2,…,1,0,… */
    const cycle = frames.length * 2 - 2;
    let step = 0;
    const timer = window.setInterval(() => {
      step = (step + 1) % cycle;
      setIndex(step < frames.length ? step : cycle - step);
    }, FRAME_DURATION_MS);

    return () => window.clearInterval(timer);
  }, [frames.length]);

  return (
    <div
      className="exercise-demonstration exercise-demonstration--animated"
      role="img"
      aria-label={`Démonstration : ${name}`}
    >
      {frames.map((frame, i) => (
        <img
          key={frame}
          src={frame}
          alt=""
          className={i === index ? "is-visible" : ""}
          draggable={false}
        />
      ))}
    </div>
  );
}
