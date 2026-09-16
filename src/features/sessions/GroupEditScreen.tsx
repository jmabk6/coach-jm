import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  CirclePlus,
  GripVertical,
  Info,
  Link2,
  LogOut,
  Trash2,
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Exercise, GroupBlock, GroupChild, SessionTemplate } from "../../domain";
import {
  formatExerciseIdentity,
  formatGroupChildInstructionsRow,
  formatGroupName,
} from "../../domain/rules/blockInstructionRules";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { FieldRow, RestSelect, Stepper } from "./instructionFields";
import {
  addExercisesToGroup,
  dissolveGroup,
  listExerciseIds,
  removeBlock,
  updateGroupSettings,
} from "./sessionTemplateEdits";
import { useSessionTemplate } from "./useSessionTemplate";
import "./BlockEditScreen.css";
import "./GroupEditScreen.css";

/**
 * Modifier le groupe (§7, mockup p. 10) : nom libre, description, tours et
 * repos entre tours — absorbés pour tous les enfants —, ordre des enfants
 * par poignées (le seul endroit où ils se réordonnent), ajout d'exercices.
 * La règle des deux exercices minimum est affichée à l'avance.
 */
export function GroupEditScreen() {
  const { sessionId, groupId } = useParams<{ sessionId: string; groupId: string }>();
  const { state, save } = useSessionTemplate(sessionId);

  if (state.status === "loading") {
    return <p className="block-edit__message">Chargement…</p>;
  }

  if (state.status === "missing") {
    return <p className="block-edit__message">Séance introuvable.</p>;
  }

  const { template, exerciseById } = state;
  const group = template.blocks.find(
    (block): block is GroupBlock => block.id === groupId && block.kind === "group",
  );

  if (!group) {
    return (
      <section className="block-edit">
        <Link to={`/sessions/${template.id}`} className="block-edit__back">
          ‹ {template.name}
        </Link>
        <p className="block-edit__message">Groupe introuvable.</p>
      </section>
    );
  }

  return (
    <GroupEditForm
      key={`${group.id}-${group.children.map((child) => child.id).join(",")}`}
      template={template}
      group={group}
      exerciseById={exerciseById}
      save={save}
    />
  );
}

interface GroupEditFormProps {
  template: SessionTemplate;
  group: GroupBlock;
  exerciseById: Map<string, Exercise>;
  save: (template: SessionTemplate) => Promise<void>;
}

interface Draft {
  name: string;
  description: string;
  rounds: number;
  restBetweenRoundsSec: number;
  childOrder: string[];
}

function initialDraft(group: GroupBlock): Draft {
  return {
    name: group.name ?? "",
    description: group.description ?? "",
    rounds: group.rounds,
    restBetweenRoundsSec: group.restBetweenRoundsSec,
    childOrder: [...group.children]
      .sort((a, b) => a.position - b.position)
      .map((child) => child.id),
  };
}

function GroupEditForm({ template, group, exerciseById, save }: GroupEditFormProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(group));
  const [sheet, setSheet] = useState<"discard" | "dissolve" | "delete">();
  const [pendingNavigation, setPendingNavigation] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const backTo = `/sessions/${template.id}`;
  const selfPath = `${backTo}/groups/${group.id}`;
  const numbering = calculateBlockNumbering(template.blocks);
  const groupNumber = numbering[group.id] ?? "";
  const displayName = formatGroupName(group, groupNumber);
  const newId = () => crypto.randomUUID();

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft(group)),
    [draft, group],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const childById = new Map(group.children.map((child) => [child.id, child]));
  const orderedChildren = draft.childOrder.flatMap((id) => {
    const child = childById.get(id);
    return child ? [child] : [];
  });

  /* Retour de la bibliothèque : ?add=<id> ajoute en fin de groupe. Les
     exercices hors séries sont écartés et nommés dans un message. */
  const pendingAddIds = useMemo(() => searchParams.getAll("add"), [searchParams]);
  const rejectedIds = useMemo(() => searchParams.getAll("rejected"), [searchParams]);
  const addingRef = useRef(false);

  useEffect(() => {
    if (pendingAddIds.length === 0 || addingRef.current) return;

    addingRef.current = true;

    const exercises = pendingAddIds.flatMap((id) => {
      const exercise = exerciseById.get(id);
      return exercise ? [exercise] : [];
    });
    const rejected = exercises.filter((exercise) => exercise.mode !== "series");

    void save(addExercisesToGroup(template, group.id, exercises, newId)).then(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("add");
      rejected.forEach((exercise) => next.append("rejected", exercise.id));
      setSearchParams(next, { replace: true });
      addingRef.current = false;
    });
  }, [exerciseById, group.id, pendingAddIds, save, searchParams, setSearchParams, template]);

  function openLibrary() {
    const params = new URLSearchParams();
    params.set("mode", "select");
    params.set("returnTo", selfPath);
    listExerciseIds(template.blocks).forEach((id) => params.append("alreadyAdded", id));
    navigate(`/exercises?${params.toString()}`);
  }

  /* Quitter l'écran avec des modifications : feuille d'abandon, la
     destination attendue (retour, enfant, bibliothèque) est mémorisée. */
  function leaveTo(path: string) {
    if (dirty) {
      setPendingNavigation(path);
      setSheet("discard");
      return;
    }

    if (path === "library") openLibrary();
    else navigate(path);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = draft.childOrder.indexOf(String(active.id));
    const to = draft.childOrder.indexOf(String(over.id));
    setDraft({ ...draft, childOrder: arrayMove(draft.childOrder, from, to) });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);

    try {
      await save(
        updateGroupSettings(template, group.id, {
          name: draft.name,
          description: draft.description,
          rounds: draft.rounds,
          restBetweenRoundsSec: draft.restBetweenRoundsSec,
          childOrder: draft.childOrder,
        }),
      );
      navigate(backTo, { replace: true });
    } catch (cause) {
      setSaving(false);
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer.");
    }
  }

  async function handleDissolve() {
    await save(dissolveGroup(template, group.id, newId));
    navigate(backTo, { replace: true });
  }

  async function handleDelete() {
    await save(removeBlock(template, group.id));
    navigate(backTo, { replace: true });
  }

  const rejectedNames = rejectedIds
    .map((id) => exerciseById.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <section className="block-edit group-edit">
      <header className="block-edit__nav">
        <button type="button" className="block-edit__back" onClick={() => leaveTo(backTo)}>
          ‹ {template.name}
        </button>
        <h1>Modifier le groupe</h1>
        <span />
      </header>

      <form className="block-edit__form group-edit__form" onSubmit={handleSubmit} noValidate>
        <div className="group-edit__identity">
          <span className="group-edit__icon" aria-hidden="true">
            <Link2 size={26} strokeWidth={2} />
          </span>
          <label className="group-edit__field">
            <span>Nom du groupe</span>
            <input
              type="text"
              value={draft.name}
              placeholder={`Groupe ${groupNumber}`}
              autoComplete="off"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="group-edit__field">
            <span>
              Description <small>(optionnel)</small>
            </span>
            <input
              type="text"
              value={draft.description}
              placeholder="Ex. Tirage + poussée alternés"
              autoComplete="off"
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
        </div>

        <div className="block-edit__section-title">
          <h3>Paramètres du groupe</h3>
          <p>Ces paramètres s'appliquent à tous les exercices du groupe.</p>
        </div>

        <div className="block-edit__fields">
          <FieldRow label="Nombre de tours">
            <Stepper
              label="nombre de tours"
              value={draft.rounds}
              min={1}
              max={10}
              onChange={(rounds) => setDraft({ ...draft, rounds })}
            />
          </FieldRow>
          <FieldRow label="Repos entre les tours">
            <RestSelect
              label="Repos entre les tours"
              value={draft.restBetweenRoundsSec}
              onChange={(restBetweenRoundsSec) => setDraft({ ...draft, restBetweenRoundsSec })}
            />
          </FieldRow>
        </div>

        <div className="block-edit__section-title">
          <h3>Exercices du groupe</h3>
          <p>
            Réorganisez l'ordre des exercices. Touchez un exercice pour modifier
            ses consignes.
          </p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draft.childOrder} strategy={verticalListSortingStrategy}>
            <ul className="group-edit__children">
              {orderedChildren.map((child, index) => (
                <SortableChild
                  key={child.id}
                  child={child}
                  label={`${groupNumber}${String.fromCharCode(97 + index)}`}
                  exercise={exerciseById.get(child.exerciseId)}
                  onOpen={() => leaveTo(`${selfPath}/children/${child.id}`)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <button type="button" className="group-edit__add" onClick={() => leaveTo("library")}>
          <CirclePlus size={18} strokeWidth={2} aria-hidden="true" />
          <span>Ajouter un exercice au groupe</span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        {rejectedNames.length > 0 && (
          <p className="block-edit__error">
            {rejectedNames.join(", ")} : un exercice en paliers ou en mesure
            simple ne peut pas rejoindre un groupe, il n'a ni tours ni repos à
            partager.
          </p>
        )}

        <p className="block-edit__callout">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Un groupe doit contenir au moins 2 exercices.</strong>
            <br />
            Si vous retirez un exercice et qu'il n'en reste qu'un, le groupe sera
            automatiquement dissous et l'exercice restant deviendra une brique
            classique.
          </span>
        </p>

        {error && <p className="block-edit__error">{error}</p>}

        <button type="submit" className="block-edit__submit" disabled={saving}>
          Enregistrer les modifications
        </button>

        <div className="block-edit__bottom">
          <button type="button" className="block-edit__soft" onClick={() => setSheet("dissolve")}>
            <LogOut size={17} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>Dissoudre le groupe</strong>
              <small>Les exercices restent dans {template.name}</small>
            </span>
          </button>
          <button type="button" className="block-edit__danger" onClick={() => setSheet("delete")}>
            <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>Supprimer le groupe</strong>
              <small>Le groupe et ses exercices seront retirés de {template.name}</small>
            </span>
          </button>
        </div>
      </form>

      {sheet === "discard" && (
        <BottomSheet
          title="Abandonner les modifications ?"
          message="Les changements non enregistrés seront perdus."
          dismissLabel="Continuer à modifier"
          onDismiss={() => setSheet(undefined)}
          actions={[
            {
              label: "Abandonner",
              tone: "danger",
              onSelect: () => {
                if (pendingNavigation === "library") openLibrary();
                else navigate(pendingNavigation ?? backTo);
              },
            },
          ]}
        />
      )}

      {sheet === "dissolve" && (
        <BottomSheet
          title={`Dissoudre ${displayName} ?`}
          message={`Ses ${group.children.length} exercices restent dans ${template.name}, à la même place, avec ${group.rounds} séries et le repos du groupe.`}
          onDismiss={() => setSheet(undefined)}
          actions={[
            { label: "Dissoudre le groupe", tone: "primary", onSelect: () => void handleDissolve() },
          ]}
        />
      )}

      {sheet === "delete" && (
        <BottomSheet
          title={`Supprimer ${displayName} ?`}
          message={`Le groupe et ses ${group.children.length} exercices sont retirés de ${template.name}. Les exercices restent dans la bibliothèque.`}
          onDismiss={() => setSheet(undefined)}
          actions={[
            { label: "Supprimer le groupe", tone: "danger", onSelect: () => void handleDelete() },
          ]}
        />
      )}
    </section>
  );
}

interface SortableChildProps {
  child: GroupChild;
  label: string;
  exercise: Exercise | undefined;
  onOpen: () => void;
}

function SortableChild({ child, label, exercise, onOpen }: SortableChildProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: child.id });
  const url = exercise?.media?.thumbnailUrl ?? exercise?.media?.photoUrl;

  return (
    <li
      ref={setNodeRef}
      className={`group-edit__child ${isDragging ? "group-edit__child--dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="group-edit__handle"
        aria-label={`Déplacer ${exercise?.name ?? "l'exercice"}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      <button type="button" className="group-edit__child-main" onClick={onOpen}>
        <span className="block-card__thumb" aria-hidden="true">
          {url && <img src={url} alt="" loading="lazy" />}
        </span>
        <span className="block-card__number block-card__number--child">{label}</span>
        <span className="block-card__body">
          <span className="block-card__name">{exercise?.name ?? "Exercice introuvable"}</span>
          {exercise && (
            <span className="block-card__identity">{formatExerciseIdentity(exercise)}</span>
          )}
          <span className="block-card__row">
            {formatGroupChildInstructionsRow(child.instructions)}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="group-edit__chevron" />
      </button>
    </li>
  );
}
