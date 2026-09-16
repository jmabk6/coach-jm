import type {
  Exercise,
  ExerciseBlock,
  ExerciseInstructions,
  GroupBlock,
  GroupChild,
  Id,
  NoteBlock,
  SessionBlock,
  SessionTemplate,
} from "../../domain";
import { defaultInstructionsFor } from "../../domain/rules/blockInstructionRules";

/**
 * Opérations pures sur les briques d'un modèle. Chacune rend un nouveau
 * modèle, positions renumérotées de 0 à n-1 et `updatedAt` rafraîchi.
 * La numérotation visible, elle, n'est jamais stockée : elle se calcule
 * à l'affichage (`calculateBlockNumbering`).
 */

function sortedBlocks(blocks: SessionBlock[]): SessionBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position);
}

export function withBlocks(
  template: SessionTemplate,
  blocks: SessionBlock[],
  now = new Date().toISOString(),
): SessionTemplate {
  return {
    ...template,
    blocks: sortedBlocks(blocks).map((block, index) => ({
      ...block,
      position: index,
    })),
    updatedAt: now,
  };
}

/**
 * Ajoute des exercices en fin de séance, dans l'ordre reçu (§3 : A puis B).
 * Un exercice déjà présent n'est pas ajouté deux fois.
 */
export function appendExerciseBlocks(
  template: SessionTemplate,
  exercises: Exercise[],
  newId: () => Id,
): SessionTemplate {
  const present = new Set(listExerciseIds(template.blocks));
  const added: ExerciseBlock[] = [];

  for (const exercise of exercises) {
    if (present.has(exercise.id)) continue;

    present.add(exercise.id);
    added.push({
      id: newId(),
      kind: "exercise",
      position: template.blocks.length + added.length,
      exerciseId: exercise.id,
      instructions: defaultInstructionsFor(exercise, newId),
    });
  }

  return withBlocks(template, [...template.blocks, ...added]);
}

export function appendNoteBlock(
  template: SessionTemplate,
  note: { title?: string; text: string },
  newId: () => Id,
): SessionTemplate {
  const block: NoteBlock = {
    id: newId(),
    kind: "note",
    position: template.blocks.length,
    text: note.text,
    ...(note.title ? { title: note.title } : {}),
  };

  return withBlocks(template, [...template.blocks, block]);
}

export function updateNoteBlock(
  template: SessionTemplate,
  blockId: Id,
  note: { title?: string; text: string },
): SessionTemplate {
  return withBlocks(
    template,
    template.blocks.map((block) => {
      if (block.id !== blockId || block.kind !== "note") {
        return block;
      }

      const next: NoteBlock = { ...block, text: note.text };

      if (note.title) next.title = note.title;
      else delete next.title;

      return next;
    }),
  );
}

/**
 * Retire une brique de niveau séance (exercice, note, ou groupe entier).
 */
export function removeBlock(
  template: SessionTemplate,
  blockId: Id,
): SessionTemplate {
  return withBlocks(
    template,
    template.blocks.filter((block) => block.id !== blockId),
  );
}

/**
 * Réordonne les briques de niveau séance d'après une liste d'identifiants.
 * Un groupe emporte ses enfants ; ceux-ci ne bougent pas ici (§7).
 */
export function reorderBlocks(
  template: SessionTemplate,
  orderedIds: Id[],
): SessionTemplate {
  const byId = new Map(template.blocks.map((block) => [block.id, block]));
  const reordered = orderedIds.flatMap((id) => {
    const block = byId.get(id);
    return block ? [block] : [];
  });

  if (reordered.length !== template.blocks.length) {
    throw new Error("La liste réordonnée ne couvre pas toutes les briques");
  }

  return withBlocks(
    template,
    reordered.map((block, index) => ({ ...block, position: index })),
  );
}

/**
 * Identifiants d'exercices présents dans la séance, enfants compris.
 * Sert à `alreadyAdded` dans la bibliothèque en mode sélection.
 */
export function listExerciseIds(blocks: SessionBlock[]): Id[] {
  return sortedBlocks(blocks).flatMap((block) => {
    if (block.kind === "exercise") return [block.exerciseId];
    if (block.kind === "group") {
      return block.children.map((child) => child.exerciseId);
    }
    return [];
  });
}

/* -------------------------------------------------------------------------- */
/* Consignes d'une brique                                                     */
/* -------------------------------------------------------------------------- */

export function updateExerciseBlock(
  template: SessionTemplate,
  blockId: Id,
  changes: Pick<ExerciseBlock, "exerciseId" | "instructions"> & {
    notes?: string;
  },
): SessionTemplate {
  return withBlocks(
    template,
    template.blocks.map((block) => {
      if (block.id !== blockId || block.kind !== "exercise") {
        return block;
      }

      const next: ExerciseBlock = {
        ...block,
        exerciseId: changes.exerciseId,
        instructions: changes.instructions,
      };

      if (changes.notes) next.notes = changes.notes;
      else delete next.notes;

      return next;
    }),
  );
}

export function updateGroupChild(
  template: SessionTemplate,
  groupId: Id,
  childId: Id,
  changes: Pick<GroupChild, "exerciseId" | "instructions"> & {
    restBeforeSec?: number;
    notes?: string;
  },
): SessionTemplate {
  return withBlocks(
    template,
    template.blocks.map((block) => {
      if (block.id !== groupId || block.kind !== "group") {
        return block;
      }

      return {
        ...block,
        children: block.children.map((child) => {
          if (child.id !== childId) return child;

          const next: GroupChild = {
            ...child,
            exerciseId: changes.exerciseId,
            instructions: changes.instructions,
          };

          if (changes.restBeforeSec) next.restBeforeSec = changes.restBeforeSec;
          else delete next.restBeforeSec;

          if (changes.notes) next.notes = changes.notes;
          else delete next.notes;

          return next;
        }),
      };
    }),
  );
}

/**
 * Un enfant redevient une brique classique, placée juste après son groupe.
 * Il reprend le nombre de tours en séries et le repos du groupe (§7).
 */
export function childToExerciseBlock(
  group: GroupBlock,
  child: GroupChild,
  newId: () => Id,
): ExerciseBlock {
  const instructions: ExerciseInstructions =
    child.instructions.shape === "duration"
      ? {
          shape: "duration",
          sets: group.rounds,
          durationSec: child.instructions.durationSec,
          restBetweenSetsSec: group.restBetweenRoundsSec,
          ...(child.instructions.targetRpe
            ? { targetRpe: child.instructions.targetRpe }
            : {}),
          ...(child.instructions.technicalCue
            ? { technicalCue: child.instructions.technicalCue }
            : {}),
        }
      : {
          shape: "reps",
          sets: group.rounds,
          reps: child.instructions.reps,
          restBetweenSetsSec: group.restBetweenRoundsSec,
          ...(child.instructions.targetRpe
            ? { targetRpe: child.instructions.targetRpe }
            : {}),
          ...(child.instructions.tempo ? { tempo: child.instructions.tempo } : {}),
          ...(child.instructions.technicalCue
            ? { technicalCue: child.instructions.technicalCue }
            : {}),
        };

  return {
    id: newId(),
    kind: "exercise",
    position: group.position + 0.5,
    exerciseId: child.exerciseId,
    instructions,
    ...(child.notes ? { notes: child.notes } : {}),
  };
}

/**
 * Retire un enfant de son groupe. `keep` le replace dans la séance après le
 * groupe (« Sortir du groupe ») ; sinon il quitte la séance (« Retirer »).
 *
 * Un groupe garde au moins deux exercices : s'il n'en reste qu'un, le groupe
 * est dissous et l'exercice restant redevient une brique classique (§7).
 */
export function removeGroupChild(
  template: SessionTemplate,
  groupId: Id,
  childId: Id,
  keep: boolean,
  newId: () => Id,
): SessionTemplate {
  const group = template.blocks.find(
    (block): block is GroupBlock => block.id === groupId && block.kind === "group",
  );
  const child = group?.children.find((item) => item.id === childId);

  if (!group || !child) {
    return template;
  }

  const remaining = group.children
    .filter((item) => item.id !== childId)
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: index }));

  const detached: SessionBlock[] = keep
    ? [childToExerciseBlock(group, child, newId)]
    : [];

  const groupOrDissolved: SessionBlock[] =
    remaining.length >= 2
      ? [{ ...group, children: remaining }]
      : remaining.map((item, index) => ({
          ...childToExerciseBlock(group, item, newId),
          position: group.position + 0.25 * (index + 1),
        }));

  return withBlocks(template, [
    ...template.blocks.filter((block) => block.id !== groupId),
    ...groupOrDissolved,
    ...detached,
  ]);
}
