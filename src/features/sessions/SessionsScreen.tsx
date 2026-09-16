import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Info, Plus, Search } from "lucide-react";
import type {
  Exercise,
  Id,
  SessionCategory,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../../domain";
import {
  calculateSessionTemplateDuration,
  formatCompletionCount,
  formatSessionTemplateCardioLine,
  formatSessionTemplateDuration,
  formatSessionTemplateSummary,
  isSessionTemplateScheduled,
  summarizeSessionTemplate,
} from "../../domain/rules/sessionTemplateRules";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { getWeeklyProgram } from "../../db/repositories/programRepository";
import { SessionCategoryIcon } from "./sessionCategory";
import { sessionCategories } from "./sessionCategories";
import "./SessionsScreen.css";

type LoadState =
  | { status: "loading" }
  | {
      status: "success";
      templates: SessionTemplate[];
      exerciseById: Map<Id, Exercise>;
      completedWorkouts: WorkoutSession[];
      program: WeeklyProgram | undefined;
    }
  | { status: "error"; message: string };

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesSearch(template: SessionTemplate, search: string): boolean {
  const query = normalize(search);

  if (!query) {
    return true;
  }

  return [template.name, template.description ?? ""].some((value) =>
    normalize(value).includes(query),
  );
}

/**
 * Écran Séances (spec §5) : liste plate des modèles dans l'ordre manuel,
 * catégorie en icône + étiquette et en filtre, jamais en sections.
 * Recherche et filtre vivent dans l'URL, comme pour la bibliothèque.
 */
export function SessionsScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const search = searchParams.get("q") ?? "";
  const categoryFilter = searchParams.get(
    "category",
  ) as SessionCategory | null;
  const showArchived = searchParams.get("archived") === "1";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [templates, exercises, completedWorkouts, program] =
          await Promise.all([
            getAllSessionTemplates(),
            getAllExercises(),
            getCompletedWorkouts(),
            getWeeklyProgram(),
          ]);

        if (cancelled) return;

        setState({
          status: "success",
          templates,
          exerciseById: new Map(
            exercises.map((exercise) => [exercise.id, exercise]),
          ),
          completedWorkouts,
          program,
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Impossible de charger les séances",
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  }

  const activeTemplates = useMemo(
    () =>
      state.status === "success"
        ? state.templates.filter((template) => template.status === "active")
        : [],
    [state],
  );

  const archivedTemplates = useMemo(
    () =>
      state.status === "success"
        ? state.templates.filter(
            (template) => template.status === "archived",
          )
        : [],
    [state],
  );

  const visibleTemplates = useMemo(() => {
    const source = showArchived ? archivedTemplates : activeTemplates;

    return source.filter(
      (template) =>
        (!categoryFilter || template.category === categoryFilter) &&
        matchesSearch(template, search),
    );
  }, [activeTemplates, archivedTemplates, categoryFilter, search, showArchived]);

  const completedByTemplate = useMemo(() => {
    const byTemplate = new Map<Id, WorkoutSession[]>();

    if (state.status !== "success") {
      return byTemplate;
    }

    for (const workout of state.completedWorkouts) {
      if (!workout.sessionTemplateId) continue;

      const list = byTemplate.get(workout.sessionTemplateId) ?? [];
      list.push(workout);
      byTemplate.set(workout.sessionTemplateId, list);
    }

    return byTemplate;
  }, [state]);

  if (state.status === "loading") {
    return (
      <section className="sessions-screen">
        <p className="sessions-screen__message">Chargement des séances…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="sessions-screen">
        <p className="sessions-screen__message sessions-screen__message--error">
          {state.message}
        </p>
      </section>
    );
  }

  /* État vide (§17) : titre, une phrase, `Nouvelle séance`.
     Ni recherche, ni filtres. Les archives restent accessibles s'il y en a. */
  if (activeTemplates.length === 0 && !showArchived) {
    return (
      <section className="sessions-screen">
        <div className="sessions-screen__empty">
          <h1>Aucune séance</h1>
          <p>
            Une séance est un modèle réutilisable : ses briques, ses
            consignes, prêtes à être planifiées et réalisées.
          </p>
          <button
            type="button"
            className="sessions-screen__primary"
            onClick={() => navigate("/sessions/new")}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            Nouvelle séance
          </button>
        </div>

        {archivedTemplates.length > 0 && (
          <ArchivesLink
            count={archivedTemplates.length}
            onClick={() => updateParams((params) => params.set("archived", "1"))}
          />
        )}
      </section>
    );
  }

  const hasActiveCriteria = Boolean(search) || Boolean(categoryFilter);

  return (
    <section className="sessions-screen">
      <header className="sessions-screen__header">
        <div>
          <h1>{showArchived ? "Archives" : "Séances"}</h1>
          <p>
            {showArchived
              ? "Séances archivées"
              : "Mes modèles de séance"}
          </p>
        </div>

        {!showArchived && (
          <button
            type="button"
            className="sessions-screen__primary"
            onClick={() => navigate("/sessions/new")}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            Nouvelle séance
          </button>
        )}
      </header>

      <div className="sessions-screen__search">
        <Search size={18} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) =>
            updateParams((params) => {
              if (event.target.value) params.set("q", event.target.value);
              else params.delete("q");
            })
          }
          placeholder="Rechercher une séance…"
          aria-label="Rechercher une séance"
        />
      </div>

      <div className="sessions-screen__chips" role="group" aria-label="Catégorie">
        <button
          type="button"
          className={`session-chip ${!categoryFilter ? "session-chip--active" : ""}`}
          aria-pressed={!categoryFilter}
          onClick={() => updateParams((params) => params.delete("category"))}
        >
          Toutes
        </button>

        {sessionCategories.map((category) => {
          const active = categoryFilter === category;

          return (
            <button
              key={category}
              type="button"
              className={`session-chip ${active ? "session-chip--active" : ""}`}
              aria-pressed={active}
              onClick={() =>
                updateParams((params) => {
                  if (active) params.delete("category");
                  else params.set("category", category);
                })
              }
            >
              <SessionCategoryIcon category={category} size={16} />
              {category}
            </button>
          );
        })}
      </div>

      {visibleTemplates.length === 0 ? (
        <div className="sessions-screen__no-result">
          <h2>Aucune séance ne correspond</h2>
          <p>
            {showArchived
              ? "Aucune séance archivée ne correspond à ces critères."
              : "Modifie la recherche ou retire le filtre de catégorie."}
          </p>
          {hasActiveCriteria && (
            <button
              type="button"
              className="sessions-screen__secondary"
              onClick={() =>
                updateParams((params) => {
                  params.delete("q");
                  params.delete("category");
                })
              }
            >
              Effacer les critères
            </button>
          )}
        </div>
      ) : (
        <ul className="session-list">
          {visibleTemplates.map((template) => {
            const summary = summarizeSessionTemplate(
              template.blocks,
              state.exerciseById,
            );
            const completed = completedByTemplate.get(template.id) ?? [];
            const scheduled = isSessionTemplateScheduled(
              template.id,
              state.program,
            );
            const cardioLine = formatSessionTemplateCardioLine(summary);

            return (
              <li key={template.id}>
                <Link
                  to={`/sessions/${template.id}`}
                  className="session-card"
                >
                  <span
                    className={`session-card__icon session-card__icon--${template.category}`}
                    aria-hidden="true"
                  >
                    <SessionCategoryIcon
                      category={template.category}
                      size={24}
                    />
                  </span>

                  <span className="session-card__body">
                    <span className="session-card__name">{template.name}</span>
                    <span className="session-card__summary">
                      {formatSessionTemplateSummary(
                        summary,
                        template.description,
                      )}
                    </span>
                    {cardioLine && (
                      <span className="session-card__cardio">{cardioLine}</span>
                    )}
                  </span>

                  <span className="session-card__aside">
                    <span
                      className={`session-badge ${
                        scheduled ? "session-badge--scheduled" : ""
                      }`}
                    >
                      {scheduled ? "Programmée" : "Non programmée"}
                    </span>
                    <span className="session-card__stat">
                      {formatSessionTemplateDuration(
                        calculateSessionTemplateDuration(template, completed),
                      )}
                    </span>
                    <span className="session-card__stat">
                      {formatCompletionCount(completed.length)}
                    </span>
                  </span>

                  <ChevronRight
                    className="session-card__chevron"
                    size={20}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {showArchived ? (
        <button
          type="button"
          className="sessions-screen__archives"
          onClick={() => updateParams((params) => params.delete("archived"))}
        >
          ‹ Retour aux séances actives
        </button>
      ) : (
        archivedTemplates.length > 0 && (
          <ArchivesLink
            count={archivedTemplates.length}
            onClick={() => updateParams((params) => params.set("archived", "1"))}
          />
        )
      )}

      {!showArchived && (
        <p className="sessions-screen__rule">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            La durée affichée est estimée avant 3 réalisations, puis basée sur
            la moyenne réelle de vos séances.
          </span>
        </p>
      )}
    </section>
  );
}

function ArchivesLink({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sessions-screen__archives" onClick={onClick}>
      {count === 1 ? "1 séance archivée" : `${count} séances archivées`}
      <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
