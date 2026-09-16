import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronRight,
  Info,
  Plus,
  Search,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  Exercise,
  Id,
  SessionCategory,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../../domain";
import {
  archiveSessionTemplate,
  getAllSessionTemplates,
  restoreSessionTemplate,
  updateSessionTemplatePositions,
} from "../../db/repositories/sessionTemplateRepository";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { getWeeklyProgram } from "../../db/repositories/programRepository";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SessionCard, SortableSessionCard } from "./SessionCard";
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
 * `Réorganiser` est une action distincte, indisponible sous filtre.
 */
export function SessionsScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [menuTemplate, setMenuTemplate] = useState<SessionTemplate>();
  const [reordering, setReordering] = useState(false);

  const search = searchParams.get("q") ?? "";
  const categoryFilter = searchParams.get(
    "category",
  ) as SessionCategory | null;
  const showArchived = searchParams.get("archived") === "1";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  /* Chaque archivage ou restauration incrémente `version` : l'effet recharge. */
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

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
  }, [version]);

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

  async function handleArchive(template: SessionTemplate) {
    setMenuTemplate(undefined);
    await archiveSessionTemplate(template.id);
    reload();
  }

  async function handleRestore(template: SessionTemplate) {
    setMenuTemplate(undefined);
    await restoreSessionTemplate(template.id);
    reload();
  }

  /* L'ordre manuel est global : les actives sont réordonnées, les archives
     gardent leur rang derrière elles. */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id || state.status !== "success") {
      return;
    }

    const from = activeTemplates.findIndex((item) => item.id === active.id);
    const to = activeTemplates.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(activeTemplates, from, to);

    setState({
      ...state,
      templates: [...reordered, ...archivedTemplates].map(
        (template, index) => ({ ...template, position: index }),
      ),
    });

    await updateSessionTemplatePositions([
      ...reordered.map((template) => template.id),
      ...archivedTemplates.map((template) => template.id),
    ]);
  }

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

  if (reordering) {
    return (
      <section className="sessions-screen">
        <header className="sessions-screen__header">
          <div>
            <h1>Réorganiser</h1>
            <p>Glissez les séances avec leur poignée.</p>
          </div>

          <button
            type="button"
            className="sessions-screen__primary"
            onClick={() => setReordering(false)}
          >
            Terminé
          </button>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeTemplates.map((template) => template.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="session-list">
              {activeTemplates.map((template) => (
                <SortableSessionCard key={template.id} template={template} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>
    );
  }

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

      <div className="sessions-screen__chips">
        <div role="group" aria-label="Catégorie" className="sessions-screen__chip-group">
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

        {!showArchived && activeTemplates.length > 1 && (
          <button
            type="button"
            className="session-chip session-chip--action"
            disabled={hasActiveCriteria}
            title={
              hasActiveCriteria
                ? "Retirez la recherche et le filtre pour réorganiser"
                : undefined
            }
            onClick={() => setReordering(true)}
          >
            <ArrowUpDown size={16} strokeWidth={2} aria-hidden="true" />
            Réorganiser
          </button>
        )}
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
          {visibleTemplates.map((template) => (
            <SessionCard
              key={template.id}
              template={template}
              exerciseById={state.exerciseById}
              completedWorkouts={completedByTemplate.get(template.id) ?? []}
              program={state.program}
              onOpenMenu={setMenuTemplate}
            />
          ))}
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

      {menuTemplate && (
        <BottomSheet
          title={menuTemplate.name}
          onDismiss={() => setMenuTemplate(undefined)}
          actions={
            menuTemplate.status === "archived"
              ? [
                  {
                    label: "Restaurer",
                    hint: "La séance revient dans la liste active",
                    onSelect: () => void handleRestore(menuTemplate),
                  },
                ]
              : [
                  {
                    label: "Ouvrir la séance",
                    onSelect: () => navigate(`/sessions/${menuTemplate.id}`),
                  },
                  {
                    label: "Modifier le nom ou la catégorie",
                    onSelect: () =>
                      navigate(`/sessions/${menuTemplate.id}/edit`),
                  },
                  {
                    label: "Archiver",
                    hint: "Retirée de la liste, l'historique est conservé",
                    tone: "danger",
                    onSelect: () => void handleArchive(menuTemplate),
                  },
                ]
          }
        />
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
