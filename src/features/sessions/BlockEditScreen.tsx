import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Info,
  LogOut,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type {
  Exercise,
  ExerciseBlock,
  ExerciseInstructions,
  GroupBlock,
  GroupChild,
  GroupChildInstructions,
  SessionTemplate,
} from "../../domain";
import {
  canJoinGroup,
  defaultGroupChildInstructionsFor,
  defaultInstructionsFor,
  formatExerciseIdentity,
  formatGroupName,
  formatMeasurementType,
  formatMode,
} from "../../domain/rules/blockInstructionRules";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  FieldRow,
  OptionalNumberInput,
  RangeFields,
  RestSelect,
  RpeFields,
  SecondsRangeInput,
  Stepper,
} from "./instructionFields";
import { StepsEditor } from "./StepsEditor";
import {
  listExerciseIds,
  removeBlock,
  removeGroupChild,
  updateExerciseBlock,
  updateGroupChild,
} from "./sessionTemplateEdits";
import { useSessionTemplate } from "./useSessionTemplate";
import "./BlockEditScreen.css";
import { paths } from "../../app/paths";

/**
 * Un seul écran pour toutes les variantes (§8) : exercice autonome en
 * séries, en paliers, en mesure simple, et enfant de groupe. La structure
 * ne change pas ; seuls les champs dérivent du type de mesure.
 */
export function BlockEditScreen() {
  const { sessionId, blockId, groupId, childId } = useParams<{
    sessionId: string;
    blockId?: string;
    groupId?: string;
    childId?: string;
  }>();
  const { state, save } = useSessionTemplate(sessionId);

  if (state.status === "loading") {
    return <p className="block-edit__message">Chargement…</p>;
  }

  if (state.status === "missing") {
    return <p className="block-edit__message">Séance introuvable.</p>;
  }

  const { template, exerciseById } = state;

  const target = resolveTarget(template, { blockId, groupId, childId });

  if (!target) {
    return (
      <section className="block-edit">
        <Link to={paths.session(template.id)} className="block-edit__back">
          ‹ {template.name}
        </Link>
        <p className="block-edit__message">Brique introuvable.</p>
      </section>
    );
  }

  const exercise = exerciseById.get(target.exerciseId);

  if (!exercise) {
    return (
      <section className="block-edit">
        <Link to={paths.session(template.id)} className="block-edit__back">
          ‹ {template.name}
        </Link>
        <p className="block-edit__message">
          L'exercice de cette brique n'existe plus dans la bibliothèque.
        </p>
      </section>
    );
  }

  return (
    <BlockEditForm
      key={`${target.kind}-${target.kind === "block" ? target.block.id : target.child.id}-${exercise.id}`}
      template={template}
      exerciseById={exerciseById}
      target={target}
      exercise={exercise}
      save={save}
    />
  );
}

type Target =
  | { kind: "block"; block: ExerciseBlock; exerciseId: string }
  | { kind: "child"; group: GroupBlock; child: GroupChild; exerciseId: string };

function resolveTarget(
  template: SessionTemplate,
  ids: {
    blockId: string | undefined;
    groupId: string | undefined;
    childId: string | undefined;
  },
): Target | undefined {
  if (ids.groupId && ids.childId) {
    const group = template.blocks.find(
      (block): block is GroupBlock =>
        block.id === ids.groupId && block.kind === "group",
    );
    const child = group?.children.find((item) => item.id === ids.childId);

    return group && child
      ? { kind: "child", group, child, exerciseId: child.exerciseId }
      : undefined;
  }

  const block = template.blocks.find(
    (item): item is ExerciseBlock => item.id === ids.blockId && item.kind === "exercise",
  );

  return block ? { kind: "block", block, exerciseId: block.exerciseId } : undefined;
}

/* -------------------------------------------------------------------------- */

interface BlockEditFormProps {
  template: SessionTemplate;
  exerciseById: Map<string, Exercise>;
  target: Target;
  exercise: Exercise;
  save: (template: SessionTemplate) => Promise<void>;
}

type Draft =
  | { kind: "block"; instructions: ExerciseInstructions; notes: string }
  | {
      kind: "child";
      instructions: GroupChildInstructions;
      restBeforeSec: number;
      notes: string;
    };

function initialDraft(target: Target): Draft {
  return target.kind === "block"
    ? {
        kind: "block",
        instructions: target.block.instructions,
        notes: target.block.notes ?? "",
      }
    : {
        kind: "child",
        instructions: target.child.instructions,
        restBeforeSec: target.child.restBeforeSec ?? 0,
        notes: target.child.notes ?? "",
      };
}

function BlockEditForm({ template, exerciseById, target, exercise, save }: BlockEditFormProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(target));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sheet, setSheet] = useState<"discard" | "remove" | "leave">();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const backTo = paths.session(template.id);
  const selfPath =
    target.kind === "block"
      ? `${backTo}/blocks/${target.block.id}`
      : `${backTo}/groups/${target.group.id}/children/${target.child.id}`;

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft(target)),
    [draft, target],
  );

  const numbering = calculateBlockNumbering(template.blocks);
  const newId = () => crypto.randomUUID();

  /* Retour de `Changer d'exercice` : la bibliothèque revient avec ?add=<id>.
     Le nouvel exercice remplace l'ancien ; les consignes sont conservées si
     leur forme convient encore, sinon remises aux valeurs de départ. */
  const replacementId = searchParams.get("add");
  const rejectedId = searchParams.get("rejected");
  const rejectedName = rejectedId ? exerciseById.get(rejectedId)?.name : undefined;
  const swappingRef = useRef(false);

  useEffect(() => {
    if (!replacementId || swappingRef.current) return;

    const replacement = exerciseById.get(replacementId);
    const clear = (rejected?: string) => {
      const next = new URLSearchParams(searchParams);
      next.delete("add");
      if (rejected) next.set("rejected", rejected);
      setSearchParams(next, { replace: true });
    };

    if (!replacement || replacement.id === exercise.id) {
      clear();
      return;
    }

    /* Un enfant de groupe reste en séries (§7) : le refus est porté par l'URL,
       l'écran l'explique sans toucher à la brique. */
    if (target.kind === "child" && !canJoinGroup(replacement)) {
      clear(replacement.id);
      return;
    }

    swappingRef.current = true;

    const next =
      target.kind === "block"
        ? updateExerciseBlock(template, target.block.id, {
            exerciseId: replacement.id,
            instructions: adaptInstructions(
              target.block.instructions,
              replacement,
              newId,
            ),
            ...(target.block.notes ? { notes: target.block.notes } : {}),
          })
        : updateGroupChild(template, target.group.id, target.child.id, {
            exerciseId: replacement.id,
            instructions: adaptChildInstructions(target.child.instructions, replacement),
            ...(target.child.restBeforeSec
              ? { restBeforeSec: target.child.restBeforeSec }
              : {}),
            ...(target.child.notes ? { notes: target.child.notes } : {}),
          });

    void save(next).then(() => {
      clear();
      swappingRef.current = false;
    });
  }, [exercise.id, exerciseById, replacementId, save, searchParams, setSearchParams, target, template]);

  function openLibrary() {
    const params = new URLSearchParams();
    params.set("mode", "select");
    params.set("single", "1");
    params.set("returnTo", selfPath);
    listExerciseIds(template.blocks).forEach((id) => params.append("alreadyAdded", id));
    navigate(`/exercises?${params.toString()}`);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);

    try {
      const notes = draft.notes.trim();

      if (draft.kind === "block" && target.kind === "block") {
        await save(
          updateExerciseBlock(template, target.block.id, {
            exerciseId: exercise.id,
            instructions: draft.instructions,
            ...(notes ? { notes } : {}),
          }),
        );
      } else if (draft.kind === "child" && target.kind === "child") {
        await save(
          updateGroupChild(template, target.group.id, target.child.id, {
            exerciseId: exercise.id,
            instructions: draft.instructions,
            ...(draft.restBeforeSec ? { restBeforeSec: draft.restBeforeSec } : {}),
            ...(notes ? { notes } : {}),
          }),
        );
      }

      navigate(backTo, { replace: true });
    } catch (cause) {
      setSaving(false);
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer.");
    }
  }

  async function handleRemove() {
    const next =
      target.kind === "block"
        ? removeBlock(template, target.block.id)
        : removeGroupChild(template, target.group.id, target.child.id, false, newId);

    await save(next);
    navigate(backTo, { replace: true });
  }

  async function handleLeaveGroup() {
    if (target.kind !== "child") return;

    await save(removeGroupChild(template, target.group.id, target.child.id, true, newId));
    navigate(backTo, { replace: true });
  }

  const groupLabel =
    target.kind === "child"
      ? formatGroupName(target.group, numbering[target.group.id] ?? "")
      : undefined;

  return (
    <section className="block-edit">
      <header className="block-edit__nav">
        <button
          type="button"
          className="block-edit__back"
          onClick={() => (dirty ? setSheet("discard") : navigate(backTo))}
        >
          ‹ {template.name}
        </button>
        <h1>Modifier l'exercice</h1>
        <span />
      </header>

      {/* En-tête : vignette, nom en lecture seule, identité, type de mesure */}
      <div className="block-edit__exercise">
        <span className="block-edit__thumb" aria-hidden="true">
          {(exercise.media?.thumbnailUrl ?? exercise.media?.photoUrl) && (
            <img src={exercise.media.thumbnailUrl ?? exercise.media.photoUrl} alt="" />
          )}
        </span>
        <div className="block-edit__exercise-body">
          <h2>{exercise.name}</h2>
          <p>{formatExerciseIdentity(exercise)}</p>
          {target.kind === "child" && (
            <span className="block-edit__group-tag">
              {groupLabel} · exercice {numbering[target.child.id]}
            </span>
          )}
          <button
            type="button"
            className="block-edit__swap"
            onClick={() => (dirty ? setSheet("discard") : openLibrary())}
          >
            <ArrowLeftRight size={15} strokeWidth={2.2} aria-hidden="true" />
            Changer d'exercice
          </button>
        </div>
        <div className="block-edit__measure">
          <span className="block-edit__measure-badge">
            {formatMeasurementType(exercise)}
          </span>
          <small>
            {exercise.mode === "series" ? "Type de mesure" : `Mode : ${formatMode(exercise)}`}
          </small>
        </div>
      </div>

      {target.kind === "child" && (
        <p className="block-edit__callout">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Cette brique fait partie d'un groupe.</strong>
            <br />
            Le nombre de séries et le repos entre séries se règlent au niveau
            du groupe.
            <br />
            <Link to={`${backTo}/groups/${target.group.id}`}>
              Modifier le groupe <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </span>
        </p>
      )}

      <form className="block-edit__form" onSubmit={handleSubmit} noValidate>
        <div className="block-edit__section-title">
          <h3>
            {draft.instructions.shape === "steps"
              ? "Structure des paliers"
              : "Consignes du modèle"}
          </h3>
          <p>
            {draft.instructions.shape === "steps"
              ? "Définissez les paliers de cet exercice. Ces valeurs serviront de référence lors de la séance."
              : "Ces consignes seront proposées à chaque réalisation de la séance."}
          </p>
        </div>

        <InstructionFields draft={draft} exercise={exercise} onChange={setDraft} />

        <label className="block-edit__notes">
          <span>
            Notes <small>(optionnel)</small>
          </span>
          <textarea
            value={draft.notes}
            rows={2}
            placeholder="Ex. Amplitude complète, bien contrôler la descente…"
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>

        {hasAdvancedOptions(draft) && (
          <div className="block-edit__advanced">
            <button
              type="button"
              className="block-edit__advanced-toggle"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
              <span>
                <strong>Options avancées</strong>
                <small>Tempo, consignes techniques, etc.</small>
              </span>
              <ChevronDown
                size={18}
                strokeWidth={2}
                aria-hidden="true"
                className={advancedOpen ? "is-open" : ""}
              />
            </button>

            {advancedOpen && (
              <AdvancedFields draft={draft} onChange={setDraft} />
            )}
          </div>
        )}

        <ContextCallout exercise={exercise} shape={draft.instructions.shape} />

        {rejectedName && (
          <p className="block-edit__error">
            {rejectedName} ne peut pas rejoindre un groupe : un exercice en
            paliers ou en mesure simple n'a ni tours ni repos à partager.
          </p>
        )}
        {error && <p className="block-edit__error">{error}</p>}

        <button type="submit" className="block-edit__submit" disabled={saving}>
          Enregistrer les modifications
        </button>

        {/* Actions destructives : en bas, deux actions distinctes (§7, §8) */}
        <div className="block-edit__bottom">
          {target.kind === "child" && (
            <button
              type="button"
              className="block-edit__soft"
              onClick={() => setSheet("leave")}
            >
              <LogOut size={17} strokeWidth={2} aria-hidden="true" />
              <span>
                <strong>Sortir du groupe</strong>
                <small>L'exercice sera une brique classique</small>
              </span>
            </button>
          )}
          <button
            type="button"
            className="block-edit__danger"
            onClick={() => setSheet("remove")}
          >
            <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>Retirer de {template.name}</strong>
              <small>Supprime cette brique de la séance</small>
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
            { label: "Abandonner", tone: "danger", onSelect: () => navigate(backTo) },
          ]}
        />
      )}

      {sheet === "remove" && (
        <BottomSheet
          title={`Retirer ${exercise.name} de ${template.name} ?`}
          message={
            target.kind === "child" && target.group.children.length <= 2
              ? `Le groupe ${groupLabel} n'aurait plus qu'un exercice : il sera dissous et l'exercice restant redeviendra une brique classique.`
              : "L'exercice reste dans la bibliothèque ; seule cette brique disparaît."
          }
          onDismiss={() => setSheet(undefined)}
          actions={[
            {
              label: `Retirer de ${template.name}`,
              tone: "danger",
              onSelect: () => void handleRemove(),
            },
          ]}
        />
      )}

      {sheet === "leave" && target.kind === "child" && (
        <BottomSheet
          title={`Sortir ${exercise.name} du groupe ?`}
          message={
            target.group.children.length <= 2
              ? `${groupLabel} n'aurait plus qu'un exercice : il sera dissous, ses deux exercices redeviennent des briques classiques.`
              : `L'exercice devient une brique classique placée juste après ${groupLabel}, avec ${target.group.rounds} séries et le repos du groupe.`
          }
          onDismiss={() => setSheet(undefined)}
          actions={[
            { label: "Sortir du groupe", tone: "primary", onSelect: () => void handleLeaveGroup() },
          ]}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Champs selon la forme des consignes                                        */
/* -------------------------------------------------------------------------- */

interface InstructionFieldsProps {
  draft: Draft;
  exercise: Exercise;
  onChange: (draft: Draft) => void;
}

function InstructionFields({ draft, exercise, onChange }: InstructionFieldsProps) {
  const perSide =
    exercise.measurementType === "reps_per_side" ||
    exercise.measurementType === "duration_per_side";

  if (draft.kind === "child") {
    const { instructions } = draft;
    const set = (next: GroupChildInstructions) => onChange({ ...draft, instructions: next });

    return (
      <div className="block-edit__fields">
        {instructions.shape === "reps" ? (
          <FieldRow
            label="Répétitions (fourchette)"
            hint={perSide ? "Plage de répétitions cible, par côté" : "Plage de répétitions cible par série"}
          >
            <RangeFields
              label="Répétitions"
              value={instructions.reps}
              min={1}
              max={100}
              onChange={(reps) => set({ ...instructions, reps })}
            />
          </FieldRow>
        ) : (
          <FieldRow
            label="Durée cible"
            hint={perSide ? "Par côté, à chaque tour" : "À chaque tour"}
          >
            <SecondsRangeInput
              label="Durée cible"
              value={instructions.durationSec}
              onChange={(durationSec) => set({ ...instructions, durationSec })}
            />
          </FieldRow>
        )}

        <FieldRow label="RPE cible" optional>
          <RpeFields
            value={instructions.targetRpe}
            onChange={(targetRpe) => {
              const next = { ...instructions };
              if (targetRpe) next.targetRpe = targetRpe;
              else delete next.targetRpe;
              set(next);
            }}
          />
        </FieldRow>

        <FieldRow
          label="Repos avant cet exercice"
          optional
          tone="exception"
          hint="Temps de récupération après l'exercice précédent, en plus du repos du groupe"
        >
          <RestSelect
            label="Repos avant cet exercice"
            value={draft.restBeforeSec}
            allowNone
            onChange={(restBeforeSec) => onChange({ ...draft, restBeforeSec })}
          />
        </FieldRow>
      </div>
    );
  }

  const { instructions } = draft;
  const set = (next: ExerciseInstructions) => onChange({ ...draft, instructions: next });

  switch (instructions.shape) {
    case "reps":
    case "duration":
      return (
        <div className="block-edit__fields">
          <FieldRow label="Nombre de séries">
            <Stepper
              label="nombre de séries"
              value={instructions.sets}
              min={1}
              max={10}
              onChange={(sets) => set({ ...instructions, sets })}
            />
          </FieldRow>

          {instructions.shape === "reps" ? (
            <FieldRow
              label="Répétitions (fourchette)"
              hint={perSide ? "Plage de répétitions cible, par côté" : "Plage de répétitions cible par série"}
            >
              <RangeFields
                label="Répétitions"
                value={instructions.reps}
                min={1}
                max={100}
                onChange={(reps) => set({ ...instructions, reps })}
              />
            </FieldRow>
          ) : (
            <FieldRow
              label="Durée cible par série"
              {...(perSide ? { hint: "Par côté" } : {})}
            >
              <SecondsRangeInput
                label="Durée cible par série"
                value={instructions.durationSec}
                onChange={(durationSec) => set({ ...instructions, durationSec })}
              />
            </FieldRow>
          )}

          <FieldRow label="RPE cible" optional>
            <RpeFields
              value={instructions.targetRpe}
              onChange={(targetRpe) => {
                const next = { ...instructions };
                if (targetRpe) next.targetRpe = targetRpe;
                else delete next.targetRpe;
                set(next);
              }}
            />
          </FieldRow>

          <FieldRow label="Repos entre séries">
            <RestSelect
              label="Repos entre séries"
              value={instructions.restBetweenSetsSec}
              onChange={(restBetweenSetsSec) => set({ ...instructions, restBetweenSetsSec })}
            />
          </FieldRow>
        </div>
      );

    case "steps":
      return (
        <StepsEditor
          steps={instructions.steps}
          onChange={(steps) => set({ ...instructions, steps })}
        />
      );

    case "duration_distance":
      return (
        <div className="block-edit__fields">
          <FieldRow label="Durée" optional hint="Laisser vide pour une durée libre">
            <OptionalNumberInput
              label="Durée"
              unit="min"
              value={
                instructions.durationSec !== undefined
                  ? instructions.durationSec / 60
                  : undefined
              }
              onChange={(minutes) => {
                const next = { ...instructions };
                if (minutes !== undefined) next.durationSec = Math.round(minutes * 60);
                else delete next.durationSec;
                set(next);
              }}
            />
          </FieldRow>
          <FieldRow label="Distance" optional hint="Laisser vide pour une distance libre">
            <OptionalNumberInput
              label="Distance"
              unit="km"
              step={0.1}
              value={instructions.distanceKm}
              onChange={(distanceKm) => {
                const next = { ...instructions };
                if (distanceKm !== undefined) next.distanceKm = distanceKm;
                else delete next.distanceKm;
                set(next);
              }}
            />
          </FieldRow>
        </div>
      );

    case "distance":
      return (
        <div className="block-edit__fields">
          <FieldRow label="Distance" optional hint="Laisser vide pour une distance libre">
            <OptionalNumberInput
              label="Distance"
              unit="km"
              step={0.1}
              value={instructions.distanceKm}
              onChange={(distanceKm) => {
                const next = { ...instructions };
                if (distanceKm !== undefined) next.distanceKm = distanceKm;
                else delete next.distanceKm;
                set(next);
              }}
            />
          </FieldRow>
        </div>
      );

    case "distance_cm":
      return (
        <div className="block-edit__fields">
          <FieldRow
            label={exercise.measurementLabels?.value ?? "Distance"}
            optional
            hint="Repère facultatif : la mesure se fait en séance"
          >
            <OptionalNumberInput
              label="Distance"
              unit="cm"
              value={instructions.distanceCm}
              onChange={(distanceCm) => {
                const next = { ...instructions };
                if (distanceCm !== undefined) next.distanceCm = distanceCm;
                else delete next.distanceCm;
                set(next);
              }}
            />
          </FieldRow>
        </div>
      );

    case "distance_cm_per_side":
      return (
        <div className="block-edit__fields">
          <FieldRow label={exercise.measurementLabels?.left ?? "Gauche"} optional>
            <OptionalNumberInput
              label="Gauche"
              unit="cm"
              value={instructions.leftCm}
              onChange={(leftCm) => {
                const next = { ...instructions };
                if (leftCm !== undefined) next.leftCm = leftCm;
                else delete next.leftCm;
                set(next);
              }}
            />
          </FieldRow>
          <FieldRow label={exercise.measurementLabels?.right ?? "Droite"} optional>
            <OptionalNumberInput
              label="Droite"
              unit="cm"
              value={instructions.rightCm}
              onChange={(rightCm) => {
                const next = { ...instructions };
                if (rightCm !== undefined) next.rightCm = rightCm;
                else delete next.rightCm;
                set(next);
              }}
            />
          </FieldRow>
        </div>
      );
  }
}

function hasAdvancedOptions(draft: Draft): boolean {
  return draft.instructions.shape !== "distance_cm" &&
    draft.instructions.shape !== "distance_cm_per_side";
}

interface AdvancedFieldsProps {
  draft: Draft;
  onChange: (draft: Draft) => void;
}

function AdvancedFields({ draft, onChange }: AdvancedFieldsProps) {
  const { instructions } = draft;

  function setCue(technicalCue: string) {
    const next = { ...instructions };
    if (technicalCue.trim()) next.technicalCue = technicalCue;
    else delete next.technicalCue;
    onChange({ ...draft, instructions: next } as Draft);
  }

  function setTempo(tempo: string) {
    if (instructions.shape !== "reps") return;
    const next = { ...instructions };
    if (tempo.trim()) next.tempo = tempo;
    else delete next.tempo;
    onChange({ ...draft, instructions: next } as Draft);
  }

  return (
    <div className="block-edit__advanced-fields">
      {instructions.shape === "reps" && (
        <label className="block-edit__notes">
          <span>
            Tempo <small>(optionnel)</small>
          </span>
          <input
            type="text"
            value={instructions.tempo ?? ""}
            placeholder="Ex. 3-1-1"
            onChange={(event) => setTempo(event.target.value)}
          />
        </label>
      )}
      <label className="block-edit__notes">
        <span>
          Consignes techniques <small>(optionnel)</small>
        </span>
        <textarea
          rows={2}
          value={instructions.technicalCue ?? ""}
          placeholder="Ex. Coudes serrés, regard devant"
          onChange={(event) => setCue(event.target.value)}
        />
      </label>
    </div>
  );
}

function ContextCallout({
  exercise,
  shape,
}: {
  exercise: Exercise;
  shape: ExerciseInstructions["shape"] | GroupChildInstructions["shape"];
}) {
  let title: string;
  let text: string;

  if (shape === "steps") {
    title = "Pendant la séance";
    text =
      "Les valeurs des paliers seront préremplies dans la saisie. Vous pourrez les modifier et y ajouter votre BPM et une note pour chaque palier.";
  } else if (exercise.measurementType === "load_reps") {
    title = "La charge n'est jamais une consigne du modèle.";
    text =
      "Elle se règle en séance, proposée d'après vos dernières réalisations. Ici, seules la structure et les cibles sont définies.";
  } else {
    title = "La charge n'est pas applicable pour cet exercice.";
    text =
      "Les champs affichés s'adaptent automatiquement au type de mesure de la brique (durée, répétitions, distance, etc.).";
  }

  return (
    <p className="block-edit__callout">
      <Info size={18} strokeWidth={2} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <br />
        {text}
      </span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Changement d'exercice : garder ce qui convient encore                      */
/* -------------------------------------------------------------------------- */

function adaptInstructions(
  current: ExerciseInstructions,
  replacement: Exercise,
  newId: () => string,
): ExerciseInstructions {
  const defaults = defaultInstructionsFor(replacement, newId);

  if (current.shape !== defaults.shape) {
    return defaults;
  }

  if (current.shape === "steps" && defaults.shape === "steps") {
    const currentKind = current.steps[0] && "distanceKm" in current.steps[0];
    const defaultKind = defaults.steps[0] && "distanceKm" in defaults.steps[0];
    return currentKind === defaultKind ? current : defaults;
  }

  return current;
}

function adaptChildInstructions(
  current: GroupChildInstructions,
  replacement: Exercise,
): GroupChildInstructions {
  const defaults = defaultGroupChildInstructionsFor(replacement);
  return current.shape === defaults.shape ? current : defaults;
}
