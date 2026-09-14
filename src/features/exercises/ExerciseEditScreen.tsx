import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Equipment,
  Exercise,
  ExerciseLocation,
  MeasurementType,
  Movement,
  MuscleZone,
} from "../../domain";
import {
  archiveExercise,
  getExercise,
  saveExercise,
} from "../../db/repositories/exerciseRepository";
import "./ExerciseCreateScreen.css";

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
];

type DurationDistanceMode =
  | "steps"
  | "simple";

function getDurationDistanceMode(
  exercise: Exercise,
): DurationDistanceMode {
  if (
    exercise.measurementType === "duration_distance" &&
    exercise.mode === "simple"
  ) {
    return "simple";
  }

  return "steps";
}

function updateExercise(
  current: Exercise,
  name: string,
  zone: MuscleZone,
  movement: Movement,
  equipment: Equipment,
  location: ExerciseLocation,
  measurementType: MeasurementType,
  durationDistanceMode: DurationDistanceMode,
  photoUrl: string,
  videoUrl: string,
  technique: string,
  description: string,
  musclesText: string,
  advice: string,
): Exercise {
  const base = {
    id: current.id,
    name,
    zone,
    movement,
    equipment,
    location,
    status: current.status,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),

    ...(photoUrl.trim() || videoUrl.trim()
      ? {
          media: {
            ...(photoUrl.trim()
              ? { photoUrl: photoUrl.trim() }
              : {}),
            ...(videoUrl.trim()
              ? { videoUrl: videoUrl.trim() }
              : {}),
          },
        }
      : {}),

    ...(technique.trim()
      ? { technique: technique.trim() }
      : {}),

    ...(description.trim()
      ? { description: description.trim() }
      : {}),

    ...(advice.trim()
      ? { advice: advice.trim() }
      : {}),

    ...(musclesText.trim()
      ? {
          muscles: musclesText
            .split(",")
            .map((muscle: string) => muscle.trim())
            .filter(Boolean),
        }
      : {}),

    ...(current.pinnedAlternativeExerciseIds !== undefined
      ? {
          pinnedAlternativeExerciseIds:
            current.pinnedAlternativeExerciseIds,
        }
      : {}),
  };

  switch (measurementType) {
    case "load_reps":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "reps":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "duration":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "duration_per_side":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "reps_per_side":
      return {
        ...base,
        mode: "series",
        measurementType,
      };

    case "duration_speed_incline":
      return {
        ...base,
        mode: "steps",
        measurementType,
      };

    case "duration_distance":
      return {
        ...base,
        mode: durationDistanceMode,
        measurementType,
        speedDisplay:
          current.measurementType === "duration_distance"
            ? (current.speedDisplay ?? "speed_kmh")
            : "speed_kmh",
      };

    case "distance":
      return {
        ...base,
        mode: "simple",
        measurementType,
      };
  }
}

export function ExerciseEditScreen() {
  const navigate = useNavigate();
  const { exerciseId } =
    useParams<{ exerciseId: string }>();

  const [exercise, setExercise] =
    useState<Exercise | undefined>();

  const [loading, setLoading] =
    useState(true);

  const [name, setName] =
    useState("");

  const [zone, setZone] =
    useState<MuscleZone>("Jambes");

  const [movement, setMovement] =
    useState<Movement>("Squat");

  const [equipment, setEquipment] =
    useState<Equipment>("Barre");

  const [location, setLocation] =
    useState<ExerciseLocation>("Salle");

  const [
    measurementType,
    setMeasurementType,
  ] =
    useState<MeasurementType>("load_reps");

  const [
    durationDistanceMode,
    setDurationDistanceMode,
  ] =
    useState<DurationDistanceMode>("steps");

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | undefined>();

  const [photoUrl, setPhotoUrl] =
    useState("");

  const [videoUrl, setVideoUrl] =
    useState("");

  const [technique, setTechnique] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [musclesText, setMusclesText] =
    useState("");

  const [advice, setAdvice] =
    useState("");

  const [archiving, setArchiving] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!exerciseId) {
        setError("Exercice introuvable.");
        setLoading(false);
        return;
      }

      try {
        const loaded =
          await getExercise(exerciseId);

        if (cancelled) {
          return;
        }

        if (
          !loaded ||
          loaded.status !== "active"
        ) {
          setError("Exercice introuvable.");
          setLoading(false);
          return;
        }

        setExercise(loaded);
        setName(loaded.name);
        setZone(loaded.zone);
        setMovement(loaded.movement);
        setEquipment(loaded.equipment);
        setLocation(loaded.location);
        setMeasurementType(
          loaded.measurementType,
        );
        setDurationDistanceMode(
          getDurationDistanceMode(loaded),
        );

        setPhotoUrl(
          loaded.media?.photoUrl ?? "",
        );

        setVideoUrl(
          loaded.media?.videoUrl ?? "",
        );

        setTechnique(
          loaded.technique ?? "",
        );

        setDescription(
          loaded.description ?? "",
        );

        setMusclesText(
          loaded.muscles?.join(", ") ?? "",
        );

        setAdvice(
          loaded.advice ?? "",
        );

        setLoading(false);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Impossible de charger l'exercice.",
          );
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

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
        return "Mesure simple";
    }
  }, [
    measurementType,
    durationDistanceMode,
  ]);

  const trimmedName = name.trim();

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!exercise) {
      return;
    }

    if (!trimmedName) {
      setError(
        "Le nom de l'exercice est obligatoire.",
      );
      return;
    }

    try {
      setSaving(true);
      setError(undefined);

      const updated = updateExercise(
        exercise,
        trimmedName,
        zone,
        movement,
        equipment,
        location,
        measurementType,
        durationDistanceMode,
        photoUrl,
        videoUrl,
        technique,
        description,
        musclesText,
        advice,
      );

      await saveExercise(updated);

      navigate(
        `/exercises/${updated.id}`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'enregistrer les modifications.",
      );

      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!exercise) {
      return;
    }

    const confirmed = window.confirm(
      `Archiver "${exercise.name}" ?` +
        "\n\nL'exercice disparaîtra de la bibliothèque active, " +
        "mais son historique sera conservé.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setArchiving(true);
      setError(undefined);

      await archiveExercise(exercise.id);

      navigate("/exercises");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'archiver l'exercice.",
      );

      setArchiving(false);
    }
  }

  if (loading) {
    return (
      <main className="exercise-create">
        <p>Chargement...</p>
      </main>
    );
  }

  if (!exercise) {
    return (
      <main className="exercise-create">
        <button
          type="button"
          className="exercise-create__back"
          onClick={() =>
            navigate("/exercises")
          }
        >
          ← Exercices
        </button>

        <h1>Exercice introuvable</h1>
        {error && (
          <p
            className="exercise-create__error"
            role="alert"
          >
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="exercise-create">
      <button
        type="button"
        className="exercise-create__back"
        onClick={() =>
          navigate(
            `/exercises/${exercise.id}`,
          )
        }
      >
        ← Fiche exercice
      </button>

      <header className="exercise-create__header">
        <h1>Modifier l'exercice</h1>
        <p>
          Modifiez les informations de
          {` ${exercise.name}`}.
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
          />
        </label>

        <div className="exercise-create__grid">
          <label className="exercise-create__field">
            <span>Zone</span>

            <select
              value={zone}
              onChange={(event) =>
                setZone(
                  event.target
                    .value as MuscleZone,
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
                  event.target
                    .value as Movement,
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

          <label className="exercise-create__field">
            <span>Équipement</span>

            <select
              value={equipment}
              onChange={(event) =>
                setEquipment(
                  event.target
                    .value as Equipment,
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

          <label className="exercise-create__field">
            <span>Lieu</span>

            <select
              value={location}
              onChange={(event) =>
                setLocation(
                  event.target
                    .value as ExerciseLocation,
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
            {measurementOptions.map(
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

<section className="exercise-create__extra">
          <h2>Informations complémentaires</h2>

          <label className="exercise-create__field">
            <span>Photo</span>
            <input
              type="url"
              value={photoUrl}
              onChange={(event) =>
                setPhotoUrl(event.target.value)
              }
              placeholder="URL de la photo"
            />
          </label>

          <label className="exercise-create__field">
            <span>Vidéo / démonstration</span>
            <input
              type="url"
              value={videoUrl}
              onChange={(event) =>
                setVideoUrl(event.target.value)
              }
              placeholder="URL de la vidéo"
            />
          </label>

          <label className="exercise-create__field">
            <span>Technique</span>
            <textarea
              value={technique}
              onChange={(event) =>
                setTechnique(event.target.value)
              }
              placeholder="Points techniques à retenir"
              rows={4}
            />
          </label>

          <label className="exercise-create__field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Description de l'exercice"
              rows={4}
            />
          </label>

          <label className="exercise-create__field">
            <span>Muscles sollicités</span>
            <input
              type="text"
              value={musclesText}
              onChange={(event) =>
                setMusclesText(event.target.value)
              }
              placeholder="Ex. pectoraux, triceps, deltoïdes"
            />
            <small>
              Sépare les muscles par des virgules.
            </small>
          </label>

          <label className="exercise-create__field">
            <span>Conseils / À éviter</span>
            <textarea
              value={advice}
              onChange={(event) =>
                setAdvice(event.target.value)
              }
              placeholder="Conseils, précautions, erreurs à éviter"
              rows={4}
            />
          </label>
        </section>

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
            saving ||
            trimmedName.length === 0
          }
        >
          {saving
            ? "Enregistrement..."
            : "Enregistrer les modifications"}
        </button>
      </form>

      <section className="exercise-create__danger">
        <h2>Archivage</h2>

        <p>
          L'exercice sera retiré de la bibliothèque active.
          Son historique restera conservé.
        </p>

        <button
          type="button"
          className="exercise-create__archive"
          disabled={archiving}
          onClick={() => void handleArchive()}
        >
          {archiving
            ? "Archivage..."
            : "Archiver l'exercice"}
        </button>
      </section>
    </main>
  );
}