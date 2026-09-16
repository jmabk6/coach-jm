import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  appendNoteBlock,
  removeBlock,
  updateNoteBlock,
} from "./sessionTemplateEdits";
import { useSessionTemplate } from "./useSessionTemplate";
import "./SessionTemplateForm.css";

/**
 * Une note est une brique sans numéro (§6) : un titre facultatif, un texte.
 * Même écran pour créer (`notes/new`) et modifier (`notes/:blockId`).
 */
export function SessionNoteScreen() {
  const { sessionId, blockId } = useParams<{
    sessionId: string;
    blockId: string;
  }>();
  const { state, save } = useSessionTemplate(sessionId);

  if (state.status === "loading") {
    return <p className="session-form__message">Chargement…</p>;
  }

  if (state.status === "missing") {
    return <p className="session-form__message">Séance introuvable.</p>;
  }

  const { template } = state;
  const existing =
    blockId && blockId !== "new"
      ? template.blocks.find(
          (block) => block.id === blockId && block.kind === "note",
        )
      : undefined;

  if (blockId && blockId !== "new" && !existing) {
    return (
      <section className="session-form">
        <Link to={`/sessions/${template.id}`} className="session-form__back">
          ‹ {template.name}
        </Link>
        <p className="session-form__message">Note introuvable.</p>
      </section>
    );
  }

  return (
    <NoteForm
      key={existing?.id ?? "new"}
      templateName={template.name}
      backTo={`/sessions/${template.id}`}
      initial={
        existing?.kind === "note"
          ? { title: existing.title ?? "", text: existing.text }
          : undefined
      }
      onSubmit={async (note) => {
        await save(
          existing
            ? updateNoteBlock(template, existing.id, note)
            : appendNoteBlock(template, note, () => crypto.randomUUID()),
        );
      }}
      onRemove={
        existing ? async () => save(removeBlock(template, existing.id)) : undefined
      }
    />
  );
}

interface NoteFormProps {
  templateName: string;
  backTo: string;
  initial: { title: string; text: string } | undefined;
  onSubmit: (note: { title?: string; text: string }) => Promise<void>;
  onRemove: (() => Promise<void>) | undefined;
}

function NoteForm({ templateName, backTo, initial, onSubmit, onRemove }: NoteFormProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<"discard" | "remove">();

  const trimmedTitle = title.trim();
  const trimmedText = text.trim();
  const dirty =
    trimmedTitle !== (initial?.title ?? "") || trimmedText !== (initial?.text ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedText) {
      setError("Le texte de la note est obligatoire.");
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onSubmit({
        text: trimmedText,
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
      });
      navigate(backTo, { replace: true });
    } catch (cause) {
      setSaving(false);
      setError(
        cause instanceof Error ? cause.message : "Impossible d'enregistrer la note.",
      );
    }
  }

  return (
    <section className="session-form">
      <button
        type="button"
        className="session-form__back"
        onClick={() => (dirty ? setSheet("discard") : navigate(backTo))}
      >
        ‹ {templateName}
      </button>

      <header className="session-form__header">
        <h1>{initial ? "Modifier la note" : "Ajouter une note"}</h1>
        <p>Échauffement, consigne, rappel : une note n'a pas de numéro.</p>
      </header>

      <form className="session-form__form" onSubmit={handleSubmit} noValidate>
        <label className="session-form__field">
          <span>
            Titre <small>(optionnel)</small>
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex. Échauffement"
            autoComplete="off"
          />
        </label>

        <label className="session-form__field">
          <span>Texte</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ex. 10 min de cardio léger + mobilisations articulaires"
            rows={4}
            autoFocus={!initial}
          />
        </label>

        {error && <p className="session-form__error">{error}</p>}

        <button type="submit" className="session-form__submit" disabled={saving}>
          {initial ? "Enregistrer les modifications" : "Ajouter la note"}
        </button>

        {onRemove && (
          <button
            type="button"
            className="session-form__remove"
            onClick={() => setSheet("remove")}
          >
            <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
            Retirer de {templateName}
          </button>
        )}
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

      {sheet === "remove" && onRemove && (
        <BottomSheet
          title={`Retirer cette note de ${templateName} ?`}
          onDismiss={() => setSheet(undefined)}
          actions={[
            {
              label: "Retirer la note",
              hint: "La note disparaît de cette séance",
              tone: "danger",
              onSelect: () => {
                void onRemove().then(() => navigate(backTo, { replace: true }));
              },
            },
          ]}
        />
      )}
    </section>
  );
}
