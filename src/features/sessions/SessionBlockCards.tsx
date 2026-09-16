import { EllipsisVertical, FileText, Link2, Lock } from "lucide-react";
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

/**
 * Mode sélection (§7) : seules les briques autonomes en séries sont cochables.
 * `disabled` garde la case visible mais inerte ; une note n'en a pas ;
 * un groupe montre un cadenas : pas de groupe dans un groupe.
 */
export interface BlockSelection {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

interface ExerciseBlockCardProps {
  block: ExerciseBlock;
  number: string;
  exercise: Exercise | undefined;
  selection?: BlockSelection;
  onOpen: () => void;
  onOpenMenu: () => void;
}

export function ExerciseBlockCard({
  block,
  number,
  exercise,
  selection,
  onOpen,
  onOpenMenu,
}: ExerciseBlockCardProps) {
  if (selection) {
    return (
      <div
        className={`block-card block-card--selectable ${
          selection.checked ? "block-card--checked" : ""
        } ${selection.disabled ? "block-card--unselectable" : ""}`}
      >
        <label className="block-card__check">
          <input
            type="checkbox"
            checked={selection.checked}
            disabled={selection.disabled}
            onChange={selection.onToggle}
            aria-label={`Sélectionner ${exercise?.name ?? "cette brique"}`}
          />
        </label>
        <div className="block-card__main">
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
              {selection.disabled
                ? "Ne peut pas rejoindre un groupe (pas en séries)"
                : formatExerciseInstructionsRow(block.instructions)}
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="block-card">
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
    </div>
  );
}

interface NoteBlockCardProps {
  block: NoteBlock;
  selecting?: boolean;
  onOpen: () => void;
  onOpenMenu: () => void;
}

export function NoteBlockCard({ block, selecting, onOpen, onOpenMenu }: NoteBlockCardProps) {
  if (selecting) {
    return (
      <div className="block-card block-card--note block-card--selectable block-card--unselectable">
        <span className="block-card__check" aria-hidden="true">
          <input type="checkbox" disabled />
        </span>
        <div className="block-card__main">
          <span className="block-card__number" aria-hidden="true" />
          <span className="block-card__thumb block-card__thumb--note" aria-hidden="true">
            <FileText size={22} strokeWidth={2} />
          </span>
          <span className="block-card__body">
            {block.title && <span className="block-card__name">{block.title}</span>}
            <span className={block.title ? "block-card__row" : "block-card__name"}>
              {block.text}
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="block-card block-card--note">
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
    </div>
  );
}

interface GroupBlockCardProps {
  block: GroupBlock;
  number: string;
  numbering: Partial<Record<Id, string>>;
  exerciseById: Map<Id, Exercise>;
  selecting?: boolean;
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
  selecting,
  onOpen,
  onOpenChild,
  onOpenMenu,
}: GroupBlockCardProps) {
  const children = [...block.children].sort((a, b) => a.position - b.position);
  const name = formatGroupName(block, number);

  return (
    <div
      className={`block-card block-card--group ${
        selecting ? "block-card--selectable block-card--locked" : ""
      }`}
    >
      {selecting && (
        <span className="block-card__check block-card__lock" aria-hidden="true">
          <Lock size={18} strokeWidth={2} />
        </span>
      )}
      <div className="block-card__group-head">
        <button type="button" className="block-card__main" onClick={onOpen} disabled={selecting}>
          <span className="block-card__number">{number}</span>
          <span className="block-card__thumb block-card__thumb--group" aria-hidden="true">
            <Link2 size={22} strokeWidth={2} />
          </span>
          <span className="block-card__body">
            <span className="block-card__name">{name}</span>
            <span className="block-card__row">{formatGroupRow(block)}</span>
          </span>
        </button>

        {!selecting && <MenuButton label={name} onClick={onOpenMenu} />}
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
                disabled={selecting}
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
    </div>
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
