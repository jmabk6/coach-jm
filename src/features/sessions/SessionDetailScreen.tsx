import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Dumbbell, EllipsisVertical, FileText, Plus } from "lucide-react";
import type { SessionBlock } from "../../domain";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import { archiveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { BottomSheet, type SheetAction } from "../../components/ui/BottomSheet";
import {
  ExerciseBlockCard,
  GroupBlockCard,
  NoteBlockCard,
} from "./SessionBlockCards";
import {
  appendExerciseBlocks,
  listExerciseIds,
  removeBlock,
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

  const pendingAddIds = useMemo(() => searchParams.getAll("add"), [searchParams]);
  const addingRef = useRef(false);

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
        <Link to="/sessions" className="session-detail__back">
          ‹ Séances
        </Link>
        <h1>{template.name}</h1>
        <button
          type="button"
          className="session-detail__menu"
          aria-label="Actions sur la séance"
          onClick={() => setMenuOpen(true)}
        >
          <EllipsisVertical size={22} strokeWidth={2} aria-hidden="true" />
        </button>
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
          <ul className="block-list">
            {blocks.map((block) => {
              if (block.kind === "note") {
                return (
                  <NoteBlockCard
                    key={block.id}
                    block={block}
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
                    key={block.id}
                    block={block}
                    number={numbering[block.id] ?? ""}
                    numbering={numbering}
                    exerciseById={exerciseById}
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
                  key={block.id}
                  block={block}
                  number={numbering[block.id] ?? ""}
                  exercise={exerciseById.get(block.exerciseId)}
                  onOpen={() =>
                    navigate(`/sessions/${template.id}/blocks/${block.id}`)
                  }
                  onOpenMenu={() => setBlockMenu(block)}
                />
              );
            })}
          </ul>

          <AddActions
            templateId={template.id}
            onAddExercise={openLibrary}
            compact
          />
        </>
      )}

      {menuOpen && (
        <BottomSheet
          title={template.name}
          onDismiss={() => setMenuOpen(false)}
          actions={[
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

interface AddActionsProps {
  templateId: string;
  onAddExercise: () => void;
  compact?: boolean;
}

function AddActions({ templateId, onAddExercise, compact }: AddActionsProps) {
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
    </div>
  );
}
