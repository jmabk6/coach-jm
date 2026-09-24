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
import {
  canJoinGroup,
  defaultGroupChildInstructionsFor,
  defaultInstructionsFor,
} from "../../domain/rules/blockInstructionRules";

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
    /** Échauffement (D14) ; absent = inchangé. */
    warmup?: boolean;
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

      if (changes.warmup === true) next.role = "warmup";
      else if (changes.warmup === false) delete next.role;

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

/* -------------------------------------------------------------------------- */
/* Groupes (§7)                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Briques autonomes candidates à un groupe : des exercices de niveau séance
 * en mode séries. Une note, un groupe, un exercice en paliers ou en mesure
 * simple ne le sont pas.
 */
export function isGroupCandidate(
  block: SessionBlock,
  exerciseById: Map<Id, Exercise>,
): block is ExerciseBlock {
  if (block.kind !== "exercise") return false;

  const exercise = exerciseById.get(block.exerciseId);

  return exercise !== undefined && canJoinGroup(exercise);
}

/**
 * Une sélection est consécutive si aucune autre brique ne s'intercale
 * entre la première et la dernière, dans l'ordre de la séance.
 * Aucune réorganisation automatique : l'ordre n'est jamais modifié sans
 * geste explicite (§7).
 */
export function areBlocksConsecutive(blocks: SessionBlock[], ids: Id[]): boolean {
  const ordered = sortedBlocks(blocks);
  const indexes = ids
    .map((id) => ordered.findIndex((block) => block.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  if (indexes.length !== ids.length || indexes.length === 0) return false;

  const first = indexes[0] ?? 0;
  const last = indexes[indexes.length - 1] ?? 0;

  return last - first === indexes.length - 1;
}

function blockToGroupChild(block: ExerciseBlock, position: number): GroupChild {
  const { instructions } = block;
  const child: GroupChild = {
    id: block.id,
    position,
    exerciseId: block.exerciseId,
    instructions:
      instructions.shape === "duration"
        ? {
            shape: "duration",
            durationSec: instructions.durationSec,
            ...(instructions.targetRpe ? { targetRpe: instructions.targetRpe } : {}),
            ...(instructions.technicalCue
              ? { technicalCue: instructions.technicalCue }
              : {}),
          }
        : instructions.shape === "reps"
          ? {
              shape: "reps",
              reps: instructions.reps,
              ...(instructions.targetRpe ? { targetRpe: instructions.targetRpe } : {}),
              ...(instructions.tempo ? { tempo: instructions.tempo } : {}),
              ...(instructions.technicalCue
                ? { technicalCue: instructions.technicalCue }
                : {}),
            }
          : { shape: "reps", reps: { min: 8, max: 12 } },
  };

  if (block.notes) child.notes = block.notes;

  return child;
}

/**
 * Crée un groupe à partir de briques consécutives. Le groupe prend la place
 * de la première ; il absorbe le nombre de séries (devenu tours) et le repos
 * de la première brique, les enfants ne gardent que leurs cibles.
 */
export function createGroupFromBlocks(
  template: SessionTemplate,
  blockIds: Id[],
  exerciseById: Map<Id, Exercise>,
  newId: () => Id,
): SessionTemplate {
  if (blockIds.length < 2) {
    throw new Error("Un groupe contient au moins deux exercices");
  }

  if (!areBlocksConsecutive(template.blocks, blockIds)) {
    throw new Error("Les briques doivent être consécutives");
  }

  const ordered = sortedBlocks(template.blocks);
  const members = ordered.filter((block) => blockIds.includes(block.id));

  if (!members.every((block) => isGroupCandidate(block, exerciseById))) {
    throw new Error("Seuls des exercices en séries peuvent former un groupe");
  }

  const exerciseMembers = members as ExerciseBlock[];
  const first = exerciseMembers[0];

  if (!first) {
    throw new Error("Aucune brique sélectionnée");
  }

  const seriesShape =
    first.instructions.shape === "reps" || first.instructions.shape === "duration"
      ? first.instructions
      : undefined;

  const group: GroupBlock = {
    id: newId(),
    kind: "group",
    position: first.position,
    rounds: seriesShape?.sets ?? 3,
    restBetweenRoundsSec: seriesShape?.restBetweenSetsSec ?? 60,
    children: exerciseMembers.map((block, index) => blockToGroupChild(block, index)),
  };

  return withBlocks(template, [
    ...template.blocks.filter((block) => !blockIds.includes(block.id)),
    group,
  ]);
}

export function updateGroupSettings(
  template: SessionTemplate,
  groupId: Id,
  settings: {
    name?: string;
    description?: string;
    rounds: number;
    restBetweenRoundsSec: number;
    childOrder: Id[];
  },
): SessionTemplate {
  return withBlocks(
    template,
    template.blocks.map((block) => {
      if (block.id !== groupId || block.kind !== "group") return block;

      const byId = new Map(block.children.map((child) => [child.id, child]));
      const children = settings.childOrder
        .flatMap((id) => {
          const child = byId.get(id);
          return child ? [child] : [];
        })
        .map((child, index) => ({ ...child, position: index }));

      if (children.length !== block.children.length) {
        throw new Error("L'ordre des enfants ne couvre pas tout le groupe");
      }

      const next: GroupBlock = {
        ...block,
        rounds: settings.rounds,
        restBetweenRoundsSec: settings.restBetweenRoundsSec,
        children,
      };

      if (settings.name?.trim()) next.name = settings.name.trim();
      else delete next.name;

      if (settings.description?.trim()) next.description = settings.description.trim();
      else delete next.description;

      return next;
    }),
  );
}

/**
 * Ajoute des exercices en fin de groupe. Ceux déjà présents dans la séance
 * ou incompatibles (hors séries) sont ignorés.
 */
export function addExercisesToGroup(
  template: SessionTemplate,
  groupId: Id,
  exercises: Exercise[],
  newId: () => Id,
): SessionTemplate {
  const present = new Set(listExerciseIds(template.blocks));

  return withBlocks(
    template,
    template.blocks.map((block) => {
      if (block.id !== groupId || block.kind !== "group") return block;

      const added: GroupChild[] = [];

      for (const exercise of exercises) {
        if (present.has(exercise.id) || !canJoinGroup(exercise)) continue;

        present.add(exercise.id);
        added.push({
          id: newId(),
          position: block.children.length + added.length,
          exerciseId: exercise.id,
          instructions: defaultGroupChildInstructionsFor(exercise),
        });
      }

      return { ...block, children: [...block.children, ...added] };
    }),
  );
}

/**
 * Dissout un groupe : ses exercices restent dans la séance, à sa place,
 * dans le même ordre, redevenus des briques classiques.
 */
export function dissolveGroup(
  template: SessionTemplate,
  groupId: Id,
  newId: () => Id,
): SessionTemplate {
  const group = template.blocks.find(
    (block): block is GroupBlock => block.id === groupId && block.kind === "group",
  );

  if (!group) return template;

  const freed = [...group.children]
    .sort((a, b) => a.position - b.position)
    .map((child, index) => ({
      ...childToExerciseBlock(group, child, newId),
      position: group.position + 0.1 * (index + 1),
    }));

  return withBlocks(template, [
    ...template.blocks.filter((block) => block.id !== groupId),
    ...freed,
  ]);
}
