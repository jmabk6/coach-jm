import { useCallback, useEffect, useState } from "react";
import type { Exercise, Id, SessionTemplate } from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import {
  getSessionTemplate,
  saveSessionTemplate,
} from "../../db/repositories/sessionTemplateRepository";

export type SessionTemplateState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "success";
      template: SessionTemplate;
      exerciseById: Map<Id, Exercise>;
    };

/**
 * Charge un modèle et la bibliothèque (archives comprises : une brique peut
 * référencer un exercice archivé). `save` persiste et met l'état à jour
 * sans recharger, pour que l'écran suive immédiatement le geste.
 */
export function useSessionTemplate(sessionId: string | undefined) {
  const [state, setState] = useState<SessionTemplateState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!sessionId) {
        setState({ status: "missing" });
        return;
      }

      const [template, exercises] = await Promise.all([
        getSessionTemplate(sessionId),
        getAllExercises(),
      ]);

      if (cancelled) return;

      setState(
        template
          ? {
              status: "success",
              template,
              exerciseById: new Map(
                exercises.map((exercise) => [exercise.id, exercise]),
              ),
            }
          : { status: "missing" },
      );
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const save = useCallback(async (template: SessionTemplate) => {
    await saveSessionTemplate(template);
    setState((current) =>
      current.status === "success" ? { ...current, template } : current,
    );
  }, []);

  return { state, save };
}
