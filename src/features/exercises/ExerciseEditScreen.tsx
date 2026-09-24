import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Equipment,
  Exercise,
  ExerciseCategory,
  ExerciseLocation,
  MeasurementType,
  Movement,
  MovementFamily,
  MuscleZone,
  ProgressionGroup,
} from "../../domain";
import {
  archiveExercise,
  getActiveExercises,
  getExercise,
  saveExercise,
} from "../../db/repositories/exerciseRepository";
import { allowedProgressionGroups } from "../../domain/rules/exerciseRules";
import { ProgressionClassificationFields } from "./ProgressionClassificationFields";
import { getDurationDistanceMode, updateExercise, type DurationDistanceMode } from "./updateExercise";
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
    value: "reps_duration",
    label: "Répétitions + durée de chaque répétition",
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
    value: "duration_power",
    label: "Durée + puissance ou distance",
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
    "reps_duration",
  ],
  Cardio: [
    "duration_speed_incline",
    "duration_distance",
    "duration_power",
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

  const [category, setCategory] =
    useState<ExerciseCategory>("Musculation");

  const [zone, setZone] =
    useState<MuscleZone>("Jambes");

  const [movement, setMovement] =
    useState<Movement>("Squat");

  const [equipment, setEquipment] =
    useState<Equipment>("Barre");

  const [progressionGroup, setProgressionGroup] =
    useState<ProgressionGroup | undefined>();

  const [movementFamily, setMovementFamily] =
    useState<MovementFamily | undefined>();

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

  const [measurementLabelValue, setMeasurementLabelValue] =
    useState("");
  const [measurementLabelLeft, setMeasurementLabelLeft] =
    useState("");
  const [measurementLabelRight, setMeasurementLabelRight] =
    useState("");
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

  const [availableExercises, setAvailableExercises] =
    useState<Exercise[]>([]);

  const [
    pinnedAlternativeIds,
    setPinnedAlternativeIds,
  ] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!exerciseId) {
        setError("Exercice introuvable.");
        setLoading(false);
        return;
      }

      try {
        const [loaded, activeExercises] =
          await Promise.all([
            getExercise(exerciseId),
            getActiveExercises(),
          ]);

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
        setCategory(loaded.category);

        if (loaded.category === "Musculation") {
          setZone(loaded.zone);
          setMovement(loaded.movement);
          setEquipment(loaded.equipment);
          setProgressionGroup(loaded.progressionGroup);
          setMovementFamily(loaded.movementFamily);
        } else if (loaded.category === "Cardio") {
          setEquipment(loaded.equipment);
        }

        setLocation(loaded.location);
        setMeasurementType(
          loaded.measurementType,
        );
        setDurationDistanceMode(
          getDurationDistanceMode(loaded),
        );
        setMeasurementLabelValue(
          loaded.measurementLabels?.value ?? "",
        );
        setMeasurementLabelLeft(
          loaded.measurementLabels?.left ?? "",
        );
        setMeasurementLabelRight(
          loaded.measurementLabels?.right ?? "",
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

        setAvailableExercises(
          activeExercises.filter(
            (candidate) =>
              candidate.id !== loaded.id,
          ),
        );

        setPinnedAlternativeIds(
          loaded.pinnedAlternativeExerciseIds ?? [],
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
      case "reps_duration":
      case "duration_power":
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
        category,
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
        pinnedAlternativeIds,
        measurementLabelValue,
        measurementLabelLeft,
        measurementLabelRight,
        progressionGroup,
        movementFamily,
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

  function togglePinnedAlternative(
    alternativeId: string,
  ) {
    setPinnedAlternativeIds((current) =>
      current.includes(alternativeId)
        ? current.filter(
            (id) => id !== alternativeId,
          )
        : [...current, alternativeId],
    );
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
                  onChange={(event) => {
                    const next = event.target.value as MuscleZone;
                    setZone(next);
                    setProgressionGroup((current) =>
                      current !== undefined && allowedProgressionGroups(next).includes(current) ? current : undefined,
                    );
                  }}
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

              <ProgressionClassificationFields
                zone={zone}
                movement={movement}
                progressionGroup={progressionGroup}
                movementFamily={movementFamily}
                onProgressionGroupChange={setProgressionGroup}
                onMovementFamilyChange={setMovementFamily}
              />
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
              type="text"
              inputMode="url"
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
              type="text"
              inputMode="url"
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

        <section className="exercise-create__manual-alternatives">
          <h2>Alternatives manuelles</h2>

          <p>
            Épingle un exercice pour qu'il apparaisse toujours
            dans les alternatives de cette fiche.
          </p>

          {availableExercises.length === 0 ? (
            <p>Aucun autre exercice disponible.</p>
          ) : (
            <div className="exercise-create__alternative-list">
              {availableExercises
                .slice()
                .sort((a, b) =>
                  a.name.localeCompare(b.name, "fr"),
                )
                .map((candidate) => (
                  <label
                    key={candidate.id}
                    className="exercise-create__alternative-option"
                  >
                    <input
                      type="checkbox"
                      checked={pinnedAlternativeIds.includes(
                        candidate.id,
                      )}
                      onChange={() =>
                        togglePinnedAlternative(
                          candidate.id,
                        )
                      }
                    />

                    <span>
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.category === "Musculation"
                          ? `${candidate.zone} · ${candidate.movement} · ${candidate.equipment}`
                          : candidate.category === "Cardio"
                            ? `${candidate.category} · ${candidate.equipment} · ${candidate.location}`
                            : `${candidate.category} · ${candidate.location}`}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
          )}
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