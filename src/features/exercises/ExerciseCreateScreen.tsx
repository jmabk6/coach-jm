import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  Equipment,
  Exercise,
  ExerciseCategory,
  ExerciseLocation,
  MeasurementType,
  Movement,
  MuscleZone,
} from "../../domain";
import { saveExercise } from "../../db/repositories/exerciseRepository";
import { buildExercise, type DurationDistanceMode } from "./buildExercise";
import "./ExerciseCreateScreen.css";

const categories: ExerciseCategory[] = [
  "Musculation",
  "Cardio",
  "Mobilité",
  "Test mobilité",
];

const zones: MuscleZone[] = [
  "Jambes",
  "Dos",
  "Pecs",
  "Épaules",
  "Bras",
  "Core",
];

const movements: Movement[] = [
  "Tirage",
  "Poussée",
  "Squat",
  "Charnière",
  "Isolation",
  "Gainage",
];

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

const locations: ExerciseLocation[] = [
  "Salle",
  "Maison",
];

const measurementOptions: Array<{
  value: MeasurementType;
  label: string;
}> = [
  {
    value: "load_reps",
    label: "Charge + répétitions",
  },
  {
    value: "reps",
    label: "Répétitions",
  },
  {
    value: "duration",
    label: "Durée",
  },
  {
    value: "duration_per_side",
    label: "Durée par côté",
  },
  {
    value: "reps_per_side",
    label: "Répétitions par côté",
  },
  {
    value: "duration_speed_incline",
    label: "Durée + vitesse + pente",
  },
  {
    value: "duration_distance",
    label: "Durée + distance",
  },
  {
    value: "distance",
    label: "Distance seule",
  },
  {
    value: "distance_cm",
    label: "Distance en cm",
  },
  {
    value: "distance_cm_per_side",
    label: "Distance en cm par côté",
  },
];

const measurementTypesByCategory: Record<
  ExerciseCategory,
  MeasurementType[]
> = {
  Musculation: [
    "load_reps",
    "reps",
    "duration",
    "duration_per_side",
    "reps_per_side",
  ],
  Cardio: [
    "duration_speed_incline",
    "duration_distance",
  ],
  Mobilité: [
    "reps",
    "duration",
    "duration_per_side",
    "reps_per_side",
  ],
  "Test mobilité": [
    "distance_cm",
    "distance_cm_per_side",
  ],
};

const defaultMeasurementByCategory: Record<
  ExerciseCategory,
  MeasurementType
> = {
  Musculation: "load_reps",
  Cardio: "duration_speed_incline",
  Mobilité: "duration",
  "Test mobilité": "distance_cm",
};
export function ExerciseCreateScreen() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<ExerciseCategory>("Musculation");
  const [zone, setZone] =
    useState<MuscleZone>("Jambes");
  const [movement, setMovement] =
    useState<Movement>("Squat");
  const [equipment, setEquipment] =
    useState<Equipment>("Barre");
  const [location, setLocation] =
    useState<ExerciseLocation>("Salle");
  const [measurementType, setMeasurementType] =
    useState<MeasurementType>("load_reps");
  const [
    durationDistanceMode,
    setDurationDistanceMode,
  ] = useState<DurationDistanceMode>("steps");

  const [measurementLabelValue, setMeasurementLabelValue] =
    useState("");
  const [measurementLabelLeft, setMeasurementLabelLeft] =
    useState("");
  const [measurementLabelRight, setMeasurementLabelRight] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] =
    useState<string | undefined>();

  const trimmedName = name.trim();

  const availableMeasurementOptions = useMemo(
    () =>
      measurementOptions.filter((option) =>
        measurementTypesByCategory[category].includes(
          option.value,
        ),
      ),
    [category],
  );

  const inferredMode = useMemo(() => {
    switch (measurementType) {
      case "load_reps":
      case "reps":
      case "duration":
      case "duration_per_side":
      case "reps_per_side":
        return "Séries";

      case "duration_speed_incline":
        return "Paliers";

      case "duration_distance":
        return durationDistanceMode === "steps"
          ? "Paliers"
          : "Mesure simple";

      case "distance":
      case "distance_cm":
      case "distance_cm_per_side":
        return "Mesure simple";
    }
  }, [
    measurementType,
    durationDistanceMode,
  ]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!trimmedName) {
      setError("Le nom de l'exercice est obligatoire.");
      return;
    }

    try {
      setSaving(true);
      setError(undefined);

      const exercise = buildExercise(
        crypto.randomUUID(),
        trimmedName,
        category,
        zone,
        movement,
        equipment,
        location,
        measurementType,
        durationDistanceMode,
      );

      const measurementLabels =
        measurementType === "distance_cm"
          ? {
              ...(measurementLabelValue.trim()
                ? {
                    value:
                      measurementLabelValue.trim(),
                  }
                : {}),
            }
          : measurementType ===
              "distance_cm_per_side"
            ? {
                ...(measurementLabelLeft.trim()
                  ? {
                      left:
                        measurementLabelLeft.trim(),
                    }
                  : {}),
                ...(measurementLabelRight.trim()
                  ? {
                      right:
                        measurementLabelRight.trim(),
                    }
                  : {}),
              }
            : undefined;

      const exerciseToSave: Exercise = {
        ...exercise,
        ...(measurementLabels &&
        Object.keys(measurementLabels).length > 0
          ? { measurementLabels }
          : {}),
      };

      await saveExercise(exerciseToSave);

      navigate(`/exercises/${exerciseToSave.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'enregistrer l'exercice.",
      );
      setSaving(false);
    }
  }

  return (
    <main className="exercise-create">
      <button
        type="button"
        className="exercise-create__back"
        onClick={() => navigate("/exercises")}
      >
        ← Exercices
      </button>

      <header className="exercise-create__header">
        <h1>Nouvel exercice</h1>
        <p>
          Ajoutez un exercice à votre bibliothèque.
        </p>
      </header>

      <form
        className="exercise-create__form"
        onSubmit={handleSubmit}
      >
        <label className="exercise-create__field">
          <span>Nom</span>
          <input
            type="text"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Ex. Développé couché"
            autoFocus
          />
        </label>

        <label className="exercise-create__field">
          <span>Catégorie</span>
          <select
            value={category}
            onChange={(event) => {
              const nextCategory =
                event.target.value as ExerciseCategory;

              setCategory(nextCategory);
              setMeasurementType(
                defaultMeasurementByCategory[nextCategory],
              );
            }}
          >
            {categories.map((value) => (
              <option
                key={value}
                value={value}
              >
                {value}
              </option>
            ))}
          </select>
        </label>

        <div className="exercise-create__grid">
          {category === "Musculation" && (
            <>
              <label className="exercise-create__field">
                <span>Zone</span>
                <select
                  value={zone}
                  onChange={(event) =>
                    setZone(
                      event.target.value as MuscleZone,
                    )
                  }
                >
                  {zones.map((value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="exercise-create__field">
                <span>Mouvement</span>
                <select
                  value={movement}
                  onChange={(event) =>
                    setMovement(
                      event.target.value as Movement,
                    )
                  }
                >
                  {movements.map((value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {(category === "Musculation" ||
            category === "Cardio") && (
            <label className="exercise-create__field">
              <span>Équipement</span>
              <select
                value={equipment}
                onChange={(event) =>
                  setEquipment(
                    event.target.value as Equipment,
                  )
                }
              >
                {equipments.map((value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="exercise-create__field">
            <span>Lieu</span>
            <select
              value={location}
              onChange={(event) =>
                setLocation(
                  event.target.value as ExerciseLocation,
                )
              }
            >
              {locations.map((value) => (
                <option
                  key={value}
                  value={value}
                >
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="exercise-create__field">
          <span>Type de mesure</span>
          <select
            value={measurementType}
            onChange={(event) =>
              setMeasurementType(
                event.target
                  .value as MeasurementType,
              )
            }
          >
            {availableMeasurementOptions.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>

        {measurementType === "distance_cm" && (
          <label className="exercise-create__field">
            <span>Libellé de la mesure</span>
            <input
              type="text"
              value={measurementLabelValue}
              onChange={(event) =>
                setMeasurementLabelValue(
                  event.target.value,
                )
              }
              placeholder="Ex. Distance doigts-sol"
            />
          </label>
        )}

        {measurementType ===
          "distance_cm_per_side" && (
          <div className="exercise-create__grid">
            <label className="exercise-create__field">
              <span>Libellé gauche</span>
              <input
                type="text"
                value={measurementLabelLeft}
                onChange={(event) =>
                  setMeasurementLabelLeft(
                    event.target.value,
                  )
                }
                placeholder="Ex. Genou gauche"
              />
            </label>

            <label className="exercise-create__field">
              <span>Libellé droit</span>
              <input
                type="text"
                value={measurementLabelRight}
                onChange={(event) =>
                  setMeasurementLabelRight(
                    event.target.value,
                  )
                }
                placeholder="Ex. Genou droit"
              />
            </label>
          </div>
        )}
        {measurementType ===
          "duration_distance" && (
          <fieldset className="exercise-create__mode-choice">
            <legend>
              Mode de réalisation
            </legend>

            <label>
              <input
                type="radio"
                name="duration-distance-mode"
                value="steps"
                checked={
                  durationDistanceMode ===
                  "steps"
                }
                onChange={() =>
                  setDurationDistanceMode(
                    "steps",
                  )
                }
              />
              Paliers
            </label>

            <label>
              <input
                type="radio"
                name="duration-distance-mode"
                value="simple"
                checked={
                  durationDistanceMode ===
                  "simple"
                }
                onChange={() =>
                  setDurationDistanceMode(
                    "simple",
                  )
                }
              />
              Mesure simple
            </label>
          </fieldset>
        )}

        <div className="exercise-create__mode">
          <span>Mode de réalisation</span>
          <strong>{inferredMode}</strong>
          <small>
            Déduit automatiquement du type
            de mesure.
          </small>
        </div>

        {error && (
          <p
            className="exercise-create__error"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          className="exercise-create__submit"
          disabled={
            saving || trimmedName.length === 0
          }
        >
          {saving
            ? "Enregistrement..."
            : "Créer l'exercice"}
        </button>
      </form>
    </main>
  );
}