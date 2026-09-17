import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  Equipment,
  ExerciseCategory,
  MeasurementType,
  Movement,
  MuscleZone,
} from "../../domain";
import { saveExercise } from "../../db/repositories/exerciseRepository";
import { buildExercise, type DurationDistanceMode } from "../exercises/buildExercise";
import "../exercises/ExerciseCreateScreen.css";

const zones: MuscleZone[] = ["Jambes", "Dos", "Pecs", "Épaules", "Bras", "Core"];
const movements: Movement[] = ["Tirage", "Poussée", "Squat", "Charnière", "Isolation", "Gainage"];
const equipments: Equipment[] = [
  "Machine",
  "Poulie",
  "Barre",
  "Haltères",
  "Poids du corps",
  "Élastique",
  "Tapis",
  "Vélo",
  "Vélo elliptique",
  "Rameur",
];

const measurementOptions: Array<{ value: MeasurementType; label: string }> = [
  { value: "load_reps", label: "Charge + répétitions" },
  { value: "reps", label: "Répétitions" },
  { value: "duration", label: "Durée" },
  { value: "duration_per_side", label: "Durée par côté" },
  { value: "reps_per_side", label: "Répétitions par côté" },
  { value: "duration_speed_incline", label: "Durée + vitesse + pente" },
  { value: "duration_distance", label: "Durée + distance" },
  { value: "distance", label: "Distance seule" },
];

/**
 * Le type de mesure détermine la famille (§2, §13) : les mesures de
 * musculation exigent zone et mouvement, les mesures cardio non.
 */
function categoryFor(measurementType: MeasurementType): ExerciseCategory {
  switch (measurementType) {
    case "duration_speed_incline":
    case "duration_distance":
    case "distance":
      return "Cardio";
    default:
      return "Musculation";
  }
}

/**
 * Création rapide pendant la séance (§13) : nom, zone, mouvement,
 * équipement, type de mesure — et rien d'autre. Le mode de réalisation
 * est déduit du type de mesure, sauf `Durée + distance` qui demande le
 * sien. Le lieu prend celui de la séance (Salle). L'exercice rejoint la
 * bibliothèque comme n'importe quel autre et s'ajoute aussitôt à la
 * séance en cours.
 */
export function QuickExerciseScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [measurementType, setMeasurementType] = useState<MeasurementType>("load_reps");
  const [zone, setZone] = useState<MuscleZone>("Pecs");
  const [movement, setMovement] = useState<Movement>("Poussée");
  const [equipment, setEquipment] = useState<Equipment>("Machine");
  const [durationDistanceMode, setDurationDistanceMode] = useState<DurationDistanceMode>("steps");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const category = categoryFor(measurementType);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();

    if (!trimmed) {
      setError("Donnez un nom à l'exercice.");
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      const exercise = buildExercise(
        `quick-${crypto.randomUUID()}`,
        trimmed,
        category,
        zone,
        movement,
        equipment,
        "Salle",
        measurementType,
        durationDistanceMode,
      );

      await saveExercise(exercise);
      navigate(`/seance?add=${encodeURIComponent(exercise.id)}`, { replace: true });
    } catch (cause) {
      setSaving(false);
      setError(cause instanceof Error ? cause.message : "Création impossible");
    }
  }

  return (
    <main className="exercise-create">
      <Link to="/seance" className="exercise-create__back">
        ‹ Séance en cours
      </Link>

      <header className="exercise-create__header">
        <h1>Créer un exercice rapide</h1>
        <p>
          Cinq champs, le strict nécessaire en salle. Vous pourrez le compléter plus tard
          dans la bibliothèque (média, technique, alternatives).
        </p>
      </header>

      <form className="exercise-create__form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="exercise-create__field">
          <span>Nom</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Développé incliné machine"
            autoFocus
          />
        </label>

        <label className="exercise-create__field">
          <span>Type de mesure</span>
          <select
            value={measurementType}
            onChange={(event) => setMeasurementType(event.target.value as MeasurementType)}
          >
            {measurementOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {measurementType === "duration_distance" && (
          <fieldset className="exercise-create__mode-choice">
            <legend>Mode de réalisation</legend>
            <label>
              <input
                type="radio"
                name="quick-duration-distance-mode"
                value="steps"
                checked={durationDistanceMode === "steps"}
                onChange={() => setDurationDistanceMode("steps")}
              />
              Paliers
            </label>
            <label>
              <input
                type="radio"
                name="quick-duration-distance-mode"
                value="simple"
                checked={durationDistanceMode === "simple"}
                onChange={() => setDurationDistanceMode("simple")}
              />
              Mesure simple
            </label>
          </fieldset>
        )}

        {category === "Musculation" && (
          <div className="exercise-create__grid">
            <label className="exercise-create__field">
              <span>Zone</span>
              <select value={zone} onChange={(event) => setZone(event.target.value as MuscleZone)}>
                {zones.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="exercise-create__field">
              <span>Mouvement</span>
              <select value={movement} onChange={(event) => setMovement(event.target.value as Movement)}>
                {movements.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="exercise-create__field">
          <span>Équipement</span>
          <select value={equipment} onChange={(event) => setEquipment(event.target.value as Equipment)}>
            {equipments.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="exercise-create__error">{error}</p>}

        <button type="submit" className="exercise-create__submit" disabled={saving}>
          Créer et ajouter à la séance
        </button>
      </form>
    </main>
  );
}
