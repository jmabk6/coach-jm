import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Dumbbell, EllipsisVertical, FileText, GripVertical, Link2, Plus, X } from "lucide-react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlannedSession, SessionBlock } from "../../domain";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import { formatLocalDate, formatPlannedSessionTitle } from "../../domain/rules/programRules";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import * as startFromTemplate from "../workout/startFromTemplate";
import { startWorkout } from "../workout/startWorkout";
import { archiveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { BottomSheet, type SheetAction } from "../../components/ui/BottomSheet";
import {
  ExerciseBlockCard,
  GroupBlockCard,
  NoteBlockCard,
} from "./SessionBlockCards";
import {
  appendExerciseBlocks,
  areBlocksConsecutive,
  createGroupFromBlocks,
  isGroupCandidate,
  listExerciseIds,
  removeBlock,
  reorderBlocks,
} from "./sessionTemplateEdits";
import { useSessionTemplate } from "./useSessionTemplate";
import "./SessionDetailScreen.css";

/**
 * Détail d'une séance (§5–§7, mockups p. 12–13) : la liste ordonnée des
 * briques, numérotées à l'affichage. Les exercices s'ajoutent depuis la
 * bibliothèque en mode sélection, qui revient ici avec `?add=<id>`.
 */
export function SessionDetailScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, save } = useSessionTemplate(sessionId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockMenu, setBlockMenu] = useState<SessionBlock>();
  const [selectionNotice, setSelectionNotice] = useState<string>();
  /* Feuille du §10 : une planifiée du même modèle existe aujourd'hui. */
  const [startChoice, setStartChoice] = useState<PlannedSession>();

  /* Mode sélection (§7) dans l'URL : `select=1` masque la barre d'onglets,
     `picked=<id>` porte les briques cochées dans l'ordre du geste. */
  const selecting = searchParams.get("select") === "1";
  const pickedIds = useMemo(() => searchParams.getAll("picked"), [searchParams]);

  const pendingAddIds = useMemo(() => searchParams.getAll("add"), [searchParams]);
  const addingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  /* Retour de la bibliothèque : on ajoute A puis B, puis on nettoie l'URL. */
  useEffect(() => {
    if (
      state.status !== "success" ||
      pendingAddIds.length === 0 ||
      addingRef.current
    ) {
      return;
    }

    addingRef.current = true;

    const exercises = pendingAddIds.flatMap((id) => {
      const exercise = state.exerciseById.get(id);
      return exercise ? [exercise] : [];
    });

    void save(
      appendExerciseBlocks(state.template, exercises, () => crypto.randomUUID()),
    ).then(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("add");
      setSearchParams(next, { replace: true });
      addingRef.current = false;
    });
  }, [pendingAddIds, save, searchParams, setSearchParams, state]);

  if (state.status === "loading") {
    return (
      <section className="session-detail">
        <p className="session-detail__message">Chargement…</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="session-detail">
        <Link to="/sessions" className="session-detail__back">‹ Séances</Link>
        <p className="session-detail__message">Séance introuvable.</p>
      </section>
    );
  }

  const { template, exerciseById } = state;
  const blocks = [...template.blocks].sort((a, b) => a.position - b.position);
  const numbering = calculateBlockNumbering(blocks);

  function openLibrary() {
    const params = new URLSearchParams();
    params.set("mode", "select");
    params.set("returnTo", `/sessions/${template.id}`);
    listExerciseIds(template.blocks).forEach((id) =>
      params.append("alreadyAdded", id),
    );
    navigate(`/exercises?${params.toString()}`);
  }

  function updateSelection(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  }

  function startSelection() {
    setMenuOpen(false);
    updateSelection((params) => {
      params.set("select", "1");
      params.delete("picked");
    });
  }

  function stopSelection() {
    updateSelection((params) => {
      params.delete("select");
      params.delete("picked");
    });
  }

  function togglePicked(blockId: string) {
    updateSelection((params) => {
      const current = params.getAll("picked");
      params.delete("picked");
      (current.includes(blockId)
        ? current.filter((id) => id !== blockId)
        : [...current, blockId]
      ).forEach((id) => params.append("picked", id));
    });
  }

  /* Démarrage depuis le modèle (§10) : la feuille de choix dépend de
     l'existence d'une planifiée du même modèle aujourd'hui. */
  async function handleStart() {
    setMenuOpen(false);

    const planned = await startFromTemplate.findPlannedTodayForTemplate(
      template.id,
      formatLocalDate(new Date()),
    );

    if (planned) {
      setStartChoice(planned);
      return;
    }

    await launch(() => startFreeWorkout(formatLocalDate(new Date()), new Date().toISOString(), template));
  }

  async function launch(start: () => Promise<unknown>) {
    setStartChoice(undefined);

    try {
      await start();
      navigate("/seance");
    } catch (cause) {
      setSelectionNotice(cause instanceof Error ? cause.message : "Démarrage impossible");
    }
  }

  /* Le bouton reste actif : une sélection invalide s'explique au tap (§7). */
  async function handleCreateGroup() {
    if (pickedIds.length < 2) {
      setSelectionNotice(
        "Sélectionnez au moins deux briques pour créer un groupe.",
      );
      return;
    }

    if (!areBlocksConsecutive(template.blocks, pickedIds)) {
      setSelectionNotice(
        "Les briques doivent être consécutives. Déplacez-les ou modifiez votre sélection pour créer le groupe.",
      );
      return;
    }

    await save(
      createGroupFromBlocks(template, pickedIds, exerciseById, () => crypto.randomUUID()),
    );
    stopSelection();
  }

  const candidateCount = template.blocks.filter((block) =>
    isGroupCandidate(block, exerciseById),
  ).length;

  const pickedPositions = pickedIds
    .map((id) => numbering[id])
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Number(a) - Number(b));

  /* Drag & drop (§6) : la poignée est sur la brique de niveau séance ;
     un groupe emporte ses enfants, la numérotation se recalcule. */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = blocks.map((block) => block.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));

    await save(reorderBlocks(template, arrayMove(ids, from, to)));
  }

  async function handleRemove(block: SessionBlock) {
    setBlockMenu(undefined);
    await save(removeBlock(template, block.id));
  }

  async function handleArchive() {
    setMenuOpen(false);
    await archiveSessionTemplate(template.id);
    navigate("/sessions", { replace: true });
  }

  function blockMenuActions(block: SessionBlock): SheetAction[] {
    const remove: SheetAction = {
      label: `Retirer de ${template.name}`,
      hint:
        block.kind === "group"
          ? "Le groupe et ses exercices sont retirés de la séance"
          : "La brique est retirée de cette séance, l'exercice reste dans la bibliothèque",
      tone: "danger",
      onSelect: () => void handleRemove(block),
    };

    if (block.kind === "note") {
      return [
        {
          label: "Modifier la note",
          onSelect: () => navigate(`/sessions/${template.id}/notes/${block.id}`),
        },
        { ...remove, hint: "La note est retirée de cette séance" },
      ];
    }

    if (block.kind === "group") {
      return [
        {
          label: "Modifier le groupe",
          onSelect: () => navigate(`/sessions/${template.id}/groups/${block.id}`),
        },
        { ...remove, label: "Supprimer le groupe" },
      ];
    }

    return [
      {
        label: "Modifier les consignes",
        onSelect: () => navigate(`/sessions/${template.id}/blocks/${block.id}`),
      },
      remove,
    ];
  }

  return (
    <section className="session-detail">
      <header className="session-detail__nav">
        {selecting ? (
          <span className="session-detail__back session-detail__back--muted">
            Sélection
          </span>
        ) : (
          <Link to="/sessions" className="session-detail__back">
            ‹ Séances
          </Link>
        )}
        <h1>{template.name}</h1>
        {selecting ? (
          <button
            type="button"
            className="session-detail__menu session-detail__cancel"
            onClick={stopSelection}
          >
            Annuler
          </button>
        ) : (
          <button
            type="button"
            className="session-detail__menu"
            aria-label="Actions sur la séance"
            onClick={() => setMenuOpen(true)}
          >
            <EllipsisVertical size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </header>

      {blocks.length === 0 ? (
        /* État vide (§17) : titre, une phrase, deux actions. Rien d'autre. */
        <div className="session-detail__empty">
          <span className="session-detail__empty-icon" aria-hidden="true">
            <Dumbbell size={44} strokeWidth={1.8} />
          </span>
          <h2>Aucune brique pour le moment</h2>
          <p>
            Commencez à construire votre séance en ajoutant un exercice ou une
            note.
          </p>
          <AddActions
            templateId={template.id}
            onAddExercise={openLibrary}
          />
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
          <SortableContext
            items={blocks.map((block) => block.id)}
            strategy={verticalListSortingStrategy}
            disabled={selecting}
          >
          <ul className="block-list">
            {blocks.map((block) => {
              const card = (() => {
              if (block.kind === "note") {
                return (
                  <NoteBlockCard
                    block={block}
                    selecting={selecting}
                    onOpen={() =>
                      navigate(`/sessions/${template.id}/notes/${block.id}`)
                    }
                    onOpenMenu={() => setBlockMenu(block)}
                  />
                );
              }

              if (block.kind === "group") {
                return (
                  <GroupBlockCard
                    block={block}
                    number={numbering[block.id] ?? ""}
                    numbering={numbering}
                    exerciseById={exerciseById}
                    selecting={selecting}
                    onOpen={() =>
                      navigate(`/sessions/${template.id}/groups/${block.id}`)
                    }
                    onOpenChild={(child) =>
                      navigate(
                        `/sessions/${template.id}/groups/${block.id}/children/${child.id}`,
                      )
                    }
                    onOpenMenu={() => setBlockMenu(block)}
                  />
                );
              }

              return (
                <ExerciseBlockCard
                  block={block}
                  number={numbering[block.id] ?? ""}
                  exercise={exerciseById.get(block.exerciseId)}
                  {...(selecting
                    ? {
                        selection: {
                          checked: pickedIds.includes(block.id),
                          disabled: !isGroupCandidate(block, exerciseById),
                          onToggle: () => togglePicked(block.id),
                        },
                      }
                    : {})}
                  onOpen={() =>
                    navigate(`/sessions/${template.id}/blocks/${block.id}`)
                  }
                  onOpenMenu={() => setBlockMenu(block)}
                />
              );
              })();

              return (
                <SortableBlockItem
                  key={block.id}
                  id={block.id}
                  label={blockMenuTitle(block, exerciseById, numbering)}
                  draggable={!selecting && blocks.length > 1}
                >
                  {card}
                </SortableBlockItem>
              );
            })}
          </ul>
          </SortableContext>
          </DndContext>

          {!selecting && (
            <AddActions
              templateId={template.id}
              onAddExercise={openLibrary}
              {...(candidateCount >= 2 ? { onCreateGroup: startSelection } : {})}
              compact
            />
          )}
        </>
      )}

      {selecting && (
        <div className="selection-bar">
          <span className="selection-bar__count">{pickedIds.length}</span>
          <span className="selection-bar__text">
            <strong>
              {pickedIds.length === 1
                ? "1 brique sélectionnée"
                : `${pickedIds.length} briques sélectionnées`}
            </strong>
            {pickedPositions.length > 0 && (
              <small>
                {pickedPositions.length === 1
                  ? `position ${pickedPositions[0]}`
                  : `positions ${pickedPositions.slice(0, -1).join(", ")} et ${pickedPositions[pickedPositions.length - 1]}`}
              </small>
            )}
          </span>
          <button
            type="button"
            className="selection-bar__create"
            onClick={() => void handleCreateGroup()}
          >
            <Link2 size={18} strokeWidth={2} aria-hidden="true" />
            Créer un groupe
          </button>
          <button
            type="button"
            className="selection-bar__cancel"
            onClick={stopSelection}
            aria-label="Annuler la sélection"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      {selectionNotice && (
        <BottomSheet
          title={
            pickedIds.length < 2
              ? "Sélection insuffisante"
              : "Les briques doivent être consécutives"
          }
          message={selectionNotice}
          dismissLabel="OK"
          onDismiss={() => setSelectionNotice(undefined)}
          actions={[]}
        />
      )}

      {menuOpen && (
        <BottomSheet
          title={template.name}
          onDismiss={() => setMenuOpen(false)}
          actions={[
            {
              label: "Démarrer la séance",
              hint:
                blocks.length === 0
                  ? "Ajoutez au moins une brique pour démarrer"
                  : "Les consignes sont copiées ; le modèle n'est pas modifié",
              disabled: blocks.length === 0,
              tone: "primary" as const,
              onSelect: () => void handleStart(),
            },
            ...(candidateCount >= 2
              ? [
                  {
                    label: "Créer un groupe",
                    hint: "Cochez des briques consécutives, puis groupez-les",
                    onSelect: startSelection,
                  },
                ]
              : []),
            {
              label: "Modifier le nom ou la catégorie",
              onSelect: () => navigate(`/sessions/${template.id}/edit`),
            },
            {
              label: "Archiver la séance",
              hint: "Retirée de la liste, l'historique est conservé",
              tone: "danger",
              onSelect: () => void handleArchive(),
            },
          ]}
        />
      )}

      {startChoice && (
        <BottomSheet
          title={formatPlannedSessionTitle(template.name, startChoice.date)}
          message="Une séance de ce modèle est prévue aujourd'hui."
          actions={[
            {
              label: "Démarrer la séance prévue",
              hint: "La réalisation est rattachée à la séance planifiée",
              tone: "primary",
              onSelect: () => void launch(() => startWorkout(startChoice.id)),
            },
            {
              label: "Démarrer une séance supplémentaire",
              hint: "Réalisation libre : la séance prévue reste à faire",
              onSelect: () =>
                void launch(() =>
                  startFreeWorkout(formatLocalDate(new Date()), new Date().toISOString(), template),
                ),
            },
          ]}
          onDismiss={() => setStartChoice(undefined)}
        />
      )}

      {blockMenu && (
        <BottomSheet
          title={blockMenuTitle(blockMenu, exerciseById, numbering)}
          onDismiss={() => setBlockMenu(undefined)}
          actions={blockMenuActions(blockMenu)}
        />
      )}
    </section>
  );
}

function blockMenuTitle(
  block: SessionBlock,
  exerciseById: Map<string, { name: string }>,
  numbering: Partial<Record<string, string>>,
): string {
  if (block.kind === "note") return block.title ?? "Note";
  if (block.kind === "group") {
    return block.name?.trim() || `Groupe ${numbering[block.id] ?? ""}`;
  }
  return exerciseById.get(block.exerciseId)?.name ?? "Exercice";
}

interface SortableBlockItemProps {
  id: string;
  label: string;
  draggable: boolean;
  children: React.ReactNode;
}

/**
 * Élément de liste triable : la carte à gauche, la poignée à droite.
 * Les enfants d'un groupe n'en ont pas, ils suivent leur groupe (§7).
 */
function SortableBlockItem({ id, label, draggable, children }: SortableBlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !draggable });

  return (
    <li
      ref={setNodeRef}
      className={`block-item ${draggable ? "block-item--draggable" : ""} ${
        isDragging ? "block-item--dragging" : ""
      }`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children}
      {draggable && (
        <button
          type="button"
          className="block-item__handle"
          aria-label={`Déplacer ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

interface AddActionsProps {
  templateId: string;
  onAddExercise: () => void;
  /**
   * Proposé seulement quand deux briques au moins peuvent être groupées (§17) :
   * absent de l'état vide, absent tant qu'il n'y a qu'un exercice en séries.
   */
  onCreateGroup?: () => void;
  compact?: boolean;
}

function AddActions({ templateId, onAddExercise, onCreateGroup, compact }: AddActionsProps) {
  const navigate = useNavigate();

  return (
    <div className={`session-detail__actions ${compact ? "session-detail__actions--compact" : ""}`}>
      <button
        type="button"
        className="session-detail__action session-detail__action--primary"
        onClick={onAddExercise}
      >
        <Plus size={22} strokeWidth={2} aria-hidden="true" />
        <span>
          <strong>Ajouter un exercice</strong>
          {!compact && <small>Choisissez un exercice dans la bibliothèque</small>}
        </span>
      </button>

      <button
        type="button"
        className="session-detail__action"
        onClick={() => navigate(`/sessions/${templateId}/notes/new`)}
      >
        <FileText size={22} strokeWidth={2} aria-hidden="true" />
        <span>
          <strong>Ajouter une note</strong>
          {!compact && <small>Échauffement, consignes, rappel…</small>}
        </span>
      </button>

      {onCreateGroup && (
        <button
          type="button"
          className="session-detail__action session-detail__action--group"
          onClick={onCreateGroup}
        >
          <Link2 size={22} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Créer un groupe</strong>
            <small>Cochez des briques consécutives</small>
          </span>
        </button>
      )}
    </div>
  );
}
