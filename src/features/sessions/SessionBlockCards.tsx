import { EllipsisVertical, FileText, Link2 } from "lucide-react";
import type {
  Exercise,
  ExerciseBlock,
  GroupBlock,
  GroupChild,
  Id,
  NoteBlock,
} from "../../domain";
import {
  formatExerciseIdentity,
  formatExerciseInstructionsRow,
  formatGroupChildInstructionsRow,
  formatGroupName,
  formatGroupRow,
} from "../../domain/rules/blockInstructionRules";

/**
 * Cartes de briques (§6). Structure commune : numéro, vignette, nom,
 * ligne d'identité, rangée de consignes, menu `⋯`. Seul le contenu de la
 * rangée change avec le type de mesure. Une note n'a pas de numéro.
 */

interface ExerciseBlockCardProps {
  block: ExerciseBlock;
  number: string;
  exercise: Exercise | undefined;
  onOpen: () => void;
  onOpenMenu: () => void;
}

export function ExerciseBlockCard({
  block,
  number,
  exercise,
  onOpen,
  onOpenMenu,
}: ExerciseBlockCardProps) {
  return (
    <li className="block-card">
      <button type="button" className="block-card__main" onClick={onOpen}>
        <span className="block-card__number">{number}</span>
        <ExerciseThumb exercise={exercise} />
        <span className="block-card__body">
          <span className="block-card__name">
            {exercise?.name ?? "Exercice introuvable"}
          </span>
          {exercise && (
            <span className="block-card__identity">
              {formatExerciseIdentity(exercise)}
            </span>
          )}
          <span className="block-card__row">
            {formatExerciseInstructionsRow(block.instructions)}
          </span>
        </span>
      </button>

      <MenuButton label={exercise?.name ?? "cette brique"} onClick={onOpenMenu} />
    </li>
  );
}

interface NoteBlockCardProps {
  block: NoteBlock;
  onOpen: () => void;
  onOpenMenu: () => void;
}

export function NoteBlockCard({ block, onOpen, onOpenMenu }: NoteBlockCardProps) {
  return (
    <li className="block-card block-card--note">
      <button type="button" className="block-card__main" onClick={onOpen}>
        <span className="block-card__number" aria-hidden="true" />
        <span className="block-card__thumb block-card__thumb--note" aria-hidden="true">
          <FileText size={22} strokeWidth={2} />
        </span>
        <span className="block-card__body">
          {block.title && (
            <span className="block-card__name">{block.title}</span>
          )}
          <span className={block.title ? "block-card__row" : "block-card__name"}>
            {block.text}
          </span>
        </span>
      </button>

      <MenuButton label={block.title ?? "cette note"} onClick={onOpenMenu} />
    </li>
  );
}

interface GroupBlockCardProps {
  block: GroupBlock;
  number: string;
  numbering: Partial<Record<Id, string>>;
  exerciseById: Map<Id, Exercise>;
  onOpen: () => void;
  onOpenChild: (child: GroupChild) => void;
  onOpenMenu: () => void;
}

/**
 * Le groupe porte le numéro ; ses enfants sont `3a`, `3b` et n'ont pas de
 * poignée : seule la brique groupe se déplace (§7).
 */
export function GroupBlockCard({
  block,
  number,
  numbering,
  exerciseById,
  onOpen,
  onOpenChild,
  onOpenMenu,
}: GroupBlockCardProps) {
  const children = [...block.children].sort((a, b) => a.position - b.position);
  const name = formatGroupName(block, number);

  return (
    <li className="block-card block-card--group">
      <div className="block-card__group-head">
        <button type="button" className="block-card__main" onClick={onOpen}>
          <span className="block-card__number">{number}</span>
          <span className="block-card__thumb block-card__thumb--group" aria-hidden="true">
            <Link2 size={22} strokeWidth={2} />
          </span>
          <span className="block-card__body">
            <span className="block-card__name">{name}</span>
            <span className="block-card__row">{formatGroupRow(block)}</span>
          </span>
        </button>

        <MenuButton label={name} onClick={onOpenMenu} />
      </div>

      <ul className="block-card__children">
        {children.map((child) => {
          const exercise = exerciseById.get(child.exerciseId);

          return (
            <li key={child.id}>
              <button
                type="button"
                className="block-card__main block-card__child"
                onClick={() => onOpenChild(child)}
              >
                <span className="block-card__number block-card__number--child">
                  {numbering[child.id]}
                </span>
                <ExerciseThumb exercise={exercise} />
                <span className="block-card__body">
                  <span className="block-card__name">
                    {exercise?.name ?? "Exercice introuvable"}
                  </span>
                  {exercise && (
                    <span className="block-card__identity">
                      {formatExerciseIdentity(exercise)}
                    </span>
                  )}
                  <span className="block-card__row">
                    {formatGroupChildInstructionsRow(child.instructions)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function ExerciseThumb({ exercise }: { exercise: Exercise | undefined }) {
  const url = exercise?.media?.thumbnailUrl ?? exercise?.media?.photoUrl;

  return (
    <span className="block-card__thumb" aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : null}
    </span>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="block-card__menu"
      aria-label={`Actions pour ${label}`}
      onClick={onClick}
    >
      <EllipsisVertical size={20} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
