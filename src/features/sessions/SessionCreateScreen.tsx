import { useNavigate } from "react-router-dom";
import type { SessionTemplate } from "../../domain";
import {
  getNextSessionTemplatePosition,
  saveSessionTemplate,
} from "../../db/repositories/sessionTemplateRepository";
import {
  SessionTemplateForm,
  type SessionTemplateIdentity,
} from "./SessionTemplateForm";
import { paths } from "../../app/paths";

/**
 * Nouvelle séance : identité seulement. Le modèle est créé sans brique,
 * et le détail s'ouvre sur l'état vide (§17) pour ajouter la première.
 */
export function SessionCreateScreen() {
  const navigate = useNavigate();

  async function handleSubmit(identity: SessionTemplateIdentity) {
    const now = new Date().toISOString();

    const template: SessionTemplate = {
      id: crypto.randomUUID(),
      ...identity,
      status: "active",
      position: await getNextSessionTemplatePosition(),
      blocks: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveSessionTemplate(template);
    navigate(paths.session(template.id), { replace: true });
  }

  return (
    <SessionTemplateForm
      title="Nouvelle séance"
      intro="Un modèle réutilisable. Ses briques viendront ensuite."
      backLabel="Séances"
      backTo={paths.sessions()}
      submitLabel="Créer la séance"
      onSubmit={handleSubmit}
    />
  );
}
