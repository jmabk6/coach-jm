import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionCategory } from "../../domain";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SessionCategoryIcon } from "./sessionCategory";
import { sessionCategories } from "./sessionCategories";
import "./SessionTemplateForm.css";

export interface SessionTemplateIdentity {
  name: string;
  category: SessionCategory;
  description?: string;
}

interface SessionTemplateFormProps {
  title: string;
  intro: string;
  backLabel: string;
  backTo: string;
  submitLabel: string;
  initial?: SessionTemplateIdentity;
  onSubmit: (identity: SessionTemplateIdentity) => Promise<void>;
}

/**
 * Identité d'un modèle de séance (§5) : nom, catégorie explicite, description.
 *
 * La catégorie n'est jamais dérivée du contenu ; elle est choisie ici.
 * Le même formulaire sert à la création et à la modification.
 */
export function SessionTemplateForm({
  title,
  intro,
  backLabel,
  backTo,
  submitLabel,
  initial,
  onSubmit,
}: SessionTemplateFormProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<SessionCategory>(
    initial?.category ?? "Musculation",
  );
  const [description, setDescription] = useState(
    initial?.description ?? "",
  );
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [discardSheetOpen, setDiscardSheetOpen] = useState(false);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const dirty =
    trimmedName !== (initial?.name ?? "") ||
    category !== (initial?.category ?? "Musculation") ||
    trimmedDescription !== (initial?.description ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedName) {
      setError("Le nom de la séance est obligatoire.");
      return;
    }

    try {
      setSaving(true);
      setError(undefined);

      await onSubmit({
        name: trimmedName,
        category,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
    } catch (cause) {
      setSaving(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d'enregistrer la séance.",
      );
    }
  }

  /* Retour (§8) : immédiat sans modification ; sinon la feuille
     `Abandonner les modifications ?`, `Continuer à modifier` par défaut. */
  function handleBack() {
    if (dirty) {
      setDiscardSheetOpen(true);
      return;
    }

    navigate(backTo);
  }

  return (
    <section className="session-form">
      <button
        type="button"
        className="session-form__back"
        onClick={handleBack}
      >
        ‹ {backLabel}
      </button>

      <header className="session-form__header">
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>

      <form className="session-form__form" onSubmit={handleSubmit} noValidate>
        <label className="session-form__field">
          <span>Nom</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Muscu A, Cardio 1, Mobilité matin"
            autoComplete="off"
            autoFocus={!initial}
          />
        </label>

        <fieldset className="session-form__field session-form__categories">
          <legend>Catégorie</legend>
          <div className="session-form__category-options">
            {sessionCategories.map((option) => {
              const active = option === category;

              return (
                <label
                  key={option}
                  className={`session-form__category ${
                    active ? "session-form__category--active" : ""
                  } session-form__category--${option}`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={option}
                    checked={active}
                    onChange={() => setCategory(option)}
                  />
                  <SessionCategoryIcon category={option} size={18} />
                  {option}
                </label>
              );
            })}
          </div>
          <small>
            La catégorie est un choix, pas une déduction : une séance
            Musculation peut contenir un exercice cardio.
          </small>
        </fieldset>

        <label className="session-form__field">
          <span>
            Description <small>(optionnel)</small>
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex. Endurance fondamentale, Haut du corps…"
            rows={2}
          />
        </label>

        {error && <p className="session-form__error">{error}</p>}

        <button
          type="submit"
          className="session-form__submit"
          disabled={saving}
        >
          {submitLabel}
        </button>
      </form>

      {discardSheetOpen && (
        <BottomSheet
          title="Abandonner les modifications ?"
          message="Les changements non enregistrés seront perdus."
          dismissLabel="Continuer à modifier"
          onDismiss={() => setDiscardSheetOpen(false)}
          actions={[
            {
              label: "Abandonner",
              tone: "danger",
              onSelect: () => navigate(backTo),
            },
          ]}
        />
      )}
    </section>
  );
}
