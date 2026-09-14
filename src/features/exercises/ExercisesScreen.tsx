import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Exercise } from "../../domain";
import { getActiveExercises } from "../../db/repositories/exerciseRepository";
import "./ExercisesScreen.css";

type LoadState =
  | { status: "loading" }
  | { status: "success"; exercises: Exercise[] }
  | { status: "error"; message: string };

type FilterFamily = "zone" | "movement" | "equipment" | "location";
type SortMode = "recent" | "name-asc" | "name-desc";

interface FilterState {
  zone: string[];
  movement: string[];
  equipment: string[];
  location: string[];
}

const emptyFilters: FilterState = {
  zone: [],
  movement: [],
  equipment: [],
  location: [],
};

const filterGroups: Array<{
  key: FilterFamily;
  label: string;
  options: string[];
}> = [
  {
    key: "zone",
    label: "Zone",
    options: ["Jambes", "Dos", "Pecs", "Épaules", "Bras", "Core"],
  },
  {
    key: "movement",
    label: "Mouvement",
    options: [
      "Tirage",
      "Poussée",
      "Squat",
      "Charnière",
      "Isolation",
      "Gainage",
    ],
  },
  {
    key: "equipment",
    label: "Équipement",
    options: [
      "Machine",
      "Poulie",
      "Barre",
      "Haltères",
      "Poids du corps",
      "Élastique",
    ],
  },
  {
    key: "location",
    label: "Lieu",
    options: ["Salle", "Maison"],
  },
];

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function matchesExercise(
  exercise: Exercise,
  search: string,
  filters: FilterState,
): boolean {
  const query = normalizeSearchValue(search);

  const searchableText = normalizeSearchValue(
    [
      exercise.name,
      exercise.zone,
      exercise.movement,
      exercise.equipment,
    ].join(" "),
  );

  const matchesSearch =
    query.length === 0 || searchableText.includes(query);

  const matchesZone =
    filters.zone.length === 0 ||
    filters.zone.includes(exercise.zone);

  const matchesMovement =
    filters.movement.length === 0 ||
    filters.movement.includes(exercise.movement);

  const matchesEquipment =
    filters.equipment.length === 0 ||
    filters.equipment.includes(exercise.equipment);

  const matchesLocation =
    filters.location.length === 0 ||
    filters.location.includes(exercise.location);

  return (
    matchesSearch &&
    matchesZone &&
    matchesMovement &&
    matchesEquipment &&
    matchesLocation
  );
}

function sortExercises(
  exercises: Exercise[],
  sortMode: SortMode,
): Exercise[] {
  return [...exercises].sort((a, b) => {
    if (sortMode === "name-asc") {
      return a.name.localeCompare(b.name, "fr");
    }

    if (sortMode === "name-desc") {
      return b.name.localeCompare(a.name, "fr");
    }

    const dateCompare =
      new Date(b.updatedAt).getTime() -
      new Date(a.updatedAt).getTime();

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return a.name.localeCompare(b.name, "fr");
  });
}

export function ExercisesScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  useEffect(() => {
    let cancelled = false;

    async function loadExercises() {
      try {
        const exercises = await getActiveExercises();

        if (!cancelled) {
          setState({
            status: "success",
            exercises,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Impossible de charger les exercices.",
          });
        }
      }
    }

    void loadExercises();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeFilterCount =
    filters.zone.length +
    filters.movement.length +
    filters.equipment.length +
    filters.location.length;

  const filteredExercises = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }

    const matches = state.exercises.filter((exercise) =>
      matchesExercise(exercise, search, filters),
    );

    return sortExercises(matches, sortMode);
  }, [filters, search, sortMode, state]);

  function toggleFilter(family: FilterFamily, value: string) {
    setFilters((current) => {
      const currentValues = current[family];
      const alreadySelected = currentValues.includes(value);

      return {
        ...current,
        [family]: alreadySelected
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  }

  function removeFilter(family: FilterFamily, value: string) {
    setFilters((current) => ({
      ...current,
      [family]: current[family].filter((item) => item !== value),
    }));
  }

  function clearFilters() {
    setFilters(emptyFilters);
  }

  const activeFilterPills = filterGroups.flatMap((group) =>
    filters[group.key].map((value) => ({
      family: group.key,
      familyLabel: group.label,
      value,
    })),
  );

  const removalSuggestions = useMemo(() => {
    if (
      state.status !== "success" ||
      filteredExercises.length > 0 ||
      activeFilterPills.length === 0
    ) {
      return [];
    }

    return activeFilterPills.map((filter) => {
      const nextFilters: FilterState = {
        ...filters,
        [filter.family]: filters[filter.family].filter(
          (value) => value !== filter.value,
        ),
      };

      const resultingCount = state.exercises.filter((exercise) =>
        matchesExercise(exercise, search, nextFilters),
      ).length;

      return {
        ...filter,
        resultingCount,
      };
    });
  }, [
    activeFilterPills,
    filteredExercises.length,
    filters,
    search,
    state,
  ]);

  const clearAllResultCount = useMemo(() => {
    if (state.status !== "success") {
      return 0;
    }

    return state.exercises.filter((exercise) =>
      matchesExercise(exercise, search, emptyFilters),
    ).length;
  }, [search, state]);

  return (
    <section className="exercises-screen">
      <header className="exercises-screen__header">
        <div>
          <h1>Exercices</h1>
          <p>Bibliothèque d'exercices</p>
        </div>

        <button
          type="button"
          className="exercises-screen__new-button"
          onClick={() => navigate("/exercises/new")}
        >
          Nouvel exercice
        </button>
      </header>

      <div className="exercises-screen__tools">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un exercice, un muscle, un équipement..."
          aria-label="Rechercher un exercice"
        />

        <div className="exercises-screen__actions">
          <button
            type="button"
            className="filter-button"
            onClick={() => setFiltersOpen(true)}
          >
            Filtres
            {activeFilterCount > 0 && (
              <span className="filter-button__badge">
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            className="exercise-sort"
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as SortMode)
            }
            aria-label="Trier les exercices"
          >
            <option value="recent">Récents</option>
            <option value="name-asc">Nom A–Z</option>
            <option value="name-desc">Nom Z–A</option>
          </select>
        </div>

        {activeFilterPills.length > 0 && (
          <div
            className="active-filters"
            aria-label="Filtres actifs"
          >
            {activeFilterPills.map((filter) => (
              <button
                key={`${filter.family}-${filter.value}`}
                type="button"
                className="active-filter-pill"
                onClick={() =>
                  removeFilter(filter.family, filter.value)
                }
              >
                <span>
                  {filter.familyLabel} : {filter.value}
                </span>
                <span aria-hidden="true">×</span>
              </button>
            ))}

            <button
              type="button"
              className="active-filters__clear"
              onClick={clearFilters}
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {state.status === "loading" && (
        <p className="exercises-screen__message">
          Chargement des exercices...
        </p>
      )}

      {state.status === "error" && (
        <p className="exercises-screen__message exercises-screen__message--error">
          {state.message}
        </p>
      )}

      {state.status === "success" &&
        state.exercises.length === 0 && (
          <div className="exercises-screen__empty">
            <h2>Aucun exercice</h2>
            <p>Ta bibliothèque d'exercices est vide.</p>
          </div>
        )}

      {state.status === "success" &&
        state.exercises.length > 0 &&
        filteredExercises.length === 0 && (
          <div className="exercises-screen__empty">
            <h2>Aucun résultat</h2>
            <p>
              Aucun exercice ne correspond aux filtres sélectionnés.
            </p>

            {removalSuggestions.length > 0 && (
              <div className="empty-suggestions">
                <p className="empty-suggestions__title">
                  Essaie de retirer :
                </p>

                {removalSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.family}-${suggestion.value}`}
                    type="button"
                    className="empty-suggestion"
                    onClick={() =>
                      removeFilter(
                        suggestion.family,
                        suggestion.value,
                      )
                    }
                  >
                    <span>
                      {suggestion.familyLabel} : {suggestion.value}
                    </span>

                    <span className="empty-suggestion__count">
                      {suggestion.resultingCount}{" "}
                      {suggestion.resultingCount === 1
                        ? "exercice"
                        : "exercices"}
                    </span>
                  </button>
                ))}

                <button
                  type="button"
                  className="empty-suggestion empty-suggestion--clear"
                  onClick={clearFilters}
                >
                  <span>Tout effacer</span>

                  <span className="empty-suggestion__count">
                    {clearAllResultCount}{" "}
                    {clearAllResultCount === 1
                      ? "exercice"
                      : "exercices"}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

      {state.status === "success" &&
        filteredExercises.length > 0 && (
          <>
            <p className="exercises-screen__count">
              {filteredExercises.length}{" "}
              {filteredExercises.length === 1
                ? "exercice"
                : "exercices"}
            </p>

            <div className="exercise-list">
              {filteredExercises.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className="exercise-list__item"
                  onClick={() => navigate(`/exercises/${exercise.id}`)}
                >
                  <span className="exercise-list__media" aria-hidden="true">
                    {exercise.media?.photoUrl ? (
                      <img
                        src={exercise.media.photoUrl}
                        alt=""
                        className="exercise-list__image"
                      />
                    ) : (
                      <span className="exercise-list__placeholder">
                        {exercise.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>

                  <span className="exercise-list__content">
                    <span className="exercise-list__name">
                      {exercise.name}
                    </span>

                    <span className="exercise-list__meta">
                      {exercise.zone} · {exercise.movement} ·{" "}
                      {exercise.equipment}
                    </span>
                  </span>

                  <span className="exercise-list__chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

      {filtersOpen && (
        <div
          className="filter-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setFiltersOpen(false);
            }
          }}
        >
          <section
            className="filter-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filters-title"
          >
            <header className="filter-panel__header">
              <div>
                <h2 id="filters-title">Filtres</h2>
                <p>
                  {activeFilterCount === 0
                    ? "Aucun filtre actif"
                    : `${activeFilterCount} filtre${
                        activeFilterCount > 1 ? "s" : ""
                      } actif${activeFilterCount > 1 ? "s" : ""}`}
                </p>
              </div>

              <button
                type="button"
                className="filter-panel__close"
                onClick={() => setFiltersOpen(false)}
                aria-label="Fermer les filtres"
              >
                ×
              </button>
            </header>

            <div className="filter-panel__content">
              {filterGroups.map((group) => (
                <fieldset
                  key={group.key}
                  className="filter-group"
                >
                  <legend>{group.label}</legend>

                  <div className="filter-group__options">
                    {group.options.map((option) => {
                      const checked =
                        filters[group.key].includes(option);

                      return (
                        <label
                          key={option}
                          className={`filter-option ${
                            checked
                              ? "filter-option--selected"
                              : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleFilter(group.key, option)
                            }
                          />

                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            <footer className="filter-panel__footer">
              <button
                type="button"
                className="filter-panel__clear"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
              >
                Tout effacer
              </button>

              <button
                type="button"
                className="filter-panel__apply"
                onClick={() => setFiltersOpen(false)}
              >
                Voir {filteredExercises.length}{" "}
                {filteredExercises.length === 1
                  ? "exercice"
                  : "exercices"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}




