import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { SessionTemplate } from "../../domain";
import {
  getSessionTemplate,
  saveSessionTemplate,
} from "../../db/repositories/sessionTemplateRepository";
import {
  SessionTemplateForm,
  type SessionTemplateIdentity,
} from "./SessionTemplateForm";

type LoadState =
  | { status: "loading" }
  | { status: "success"; template: SessionTemplate }
  | { status: "error"; message: string };

/**
 * Modifier l'identité d'une séance : nom, catégorie, description.
 * Les briques se modifient dans le détail, jamais ici.
 */
export function SessionEditScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!sessionId) {
        setState({ status: "error", message: "Séance introuvable." });
        return;
      }

      const template = await getSessionTemplate(sessionId);

      if (cancelled) return;

      setState(
        template
          ? { status: "success", template }
          : { status: "error", message: "Séance introuvable." },
      );
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.status === "loading") {
    return <p className="session-form__message">Chargement…</p>;
  }

  if (state.status === "error") {
    return <p className="session-form__message">{state.message}</p>;
  }

  const { template } = state;

  async function handleSubmit(identity: SessionTemplateIdentity) {
    const next: SessionTemplate = {
      ...template,
      ...identity,
      updatedAt: new Date().toISOString(),
    };

    // Une description effacée disparaît, elle ne reste pas en chaîne vide.
    if (!identity.description) {
      delete next.description;
    }

    await saveSessionTemplate(next);

    navigate(`/sessions/${template.id}`, { replace: true });
  }

  return (
    <SessionTemplateForm
      title="Modifier la séance"
      intro="Nom, catégorie et description du modèle."
      backLabel={template.name}
      backTo={`/sessions/${template.id}`}
      submitLabel="Enregistrer les modifications"
      initial={{
        name: template.name,
        category: template.category,
        ...(template.description
          ? { description: template.description }
          : {}),
      }}
      onSubmit={handleSubmit}
    />
  );
}
