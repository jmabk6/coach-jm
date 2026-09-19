import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info, Plus, Trash2 } from "lucide-react";
import type {
  Id,
  SessionTemplate,
  Weekday,
  WeeklyProgram,
  WorkoutSession,
} from "../../domain";
import { getWeeklyProgram } from "../../db/repositories/programRepository";
import { getAllSessionTemplates } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import {
  createEmptyWeeklyProgram,
  setWeeklyProgramDay,
  weekdayLabels,
  weekdays,
} from "../../domain/rules/programRules";
import {
  calculateSessionTemplateDuration,
  formatSessionTemplateDuration,
} from "../../domain/rules/sessionTemplateRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import { applyWeeklyProgram } from "./applyWeeklyProgram";
import { TemplateSheet } from "./ProgramSheets";
import "./ProgramScreen.css";

type LoadState =
  | { status: "loading" }
  | {
      status: "success";
      program: Omit<WeeklyProgram, "id">;
      templates: SessionTemplate[];
      completedWorkouts: WorkoutSession[];
    };

type Flow = { kind: "day"; weekday: Weekday } | { kind: "clear" };

/**
 * `Modifier la programmation` (§9, mockup p. 23 écran 2) : la règle
 * hebdomadaire, un modèle par jour ou aucun, sans date. Chaque
 * changement est enregistré aussitôt et ne concerne que les semaines
 * futures : la semaine en cours et le passé ne bougent jamais.
 */
export function WeeklyProgramScreen() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [flow, setFlow] = useState<Flow>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [program, templates, completedWorkouts] = await Promise.all([
        getWeeklyProgram(),
        getAllSessionTemplates(),
        getCompletedWorkouts(),
      ]);

      if (cancelled) return;

      setState({
        status: "success",
        program: program ?? createEmptyWeeklyProgram(new Date().toISOString()),
        templates,
        completedWorkouts,
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const templateById = useMemo(
    () =>
      new Map(
        state.status === "success"
          ? state.templates.map((template) => [template.id, template])
          : [],
      ),
    [state],
  );

  const durationLabel = useCallback(
    (templateId: Id) => {
      const template = templateById.get(templateId);

      if (!template || state.status !== "success") return "";

      return formatSessionTemplateDuration(
        calculateSessionTemplateDuration(
          template,
          state.completedWorkouts.filter(
            (workout) => workout.sessionTemplateId === templateId,
          ),
        ),
      );
    },
    [state, templateById],
  );

  async function save(program: Omit<WeeklyProgram, "id">) {
    setFlow(undefined);
    await applyWeeklyProgram(program);
    setState((current) =>
      current.status === "success" ? { ...current, program } : current,
    );
  }

  if (state.status === "loading") {
    return (
      <section className="program-screen">
        <p className="program-screen__message">Chargement de la programmation…</p>
      </section>
    );
  }

  const activeTemplates = state.templates.filter(
    (template) => template.status === "active",
  );
  const hasAssignment = state.program.days.some((day) => day.sessionTemplateId);
  const now = () => new Date().toISOString();

  return (
    <section className="program-screen">
      <nav className="program-screen__nav">
        <Link to="/programme" className="program-screen__back">
          ‹ Programme
        </Link>
      </nav>

      <header className="program-screen__header program-screen__header--stack">
        <h1>Programmation</h1>
        <p className="program-screen__subtitle">Règle hebdomadaire</p>
      </header>

      <p className="program-notice">
        <Info size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          Cette programmation se répète automatiquement les semaines
          suivantes (sauf modification). Les séances réalisées cette semaine
          n'impactent pas les semaines futures.
        </span>
      </p>

      <ol className="program-rule">
        {weekdays.map((weekday) => {
          const templateId = state.program.days.find(
            (day) => day.weekday === weekday,
          )?.sessionTemplateId;
          const template = templateId ? templateById.get(templateId) : undefined;

          return (
            <li key={weekday} className="program-rule__day">
              <span className="program-rule__weekday">
                {weekdayLabels[weekday]}
              </span>

              <button
                type="button"
                className="program-rule__slot"
                aria-label={`${weekdayLabels[weekday]} : ${
                  template ? template.name : "aucune séance"
                }`}
                onClick={() => setFlow({ kind: "day", weekday })}
              >
                {template ? (
                  <>
                    <span
                      className={`program-row__icon ${categoryClassName("session-card__icon", template.category)}`}
                      aria-hidden="true"
                    >
                      <SessionCategoryIcon category={template.category} size={22} />
                    </span>
                    <span className="program-row__body">
                      <span className="program-row__name">{template.name}</span>
                      <span className="program-row__meta">
                        {durationLabel(template.id)}
                      </span>
                    </span>
                    <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <span className="program-rule__none">Aucune séance</span>
                    <span className="program-day__add" aria-hidden="true">
                      <Plus size={18} strokeWidth={2.2} />
                    </span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="program-screen__danger"
        disabled={!hasAssignment}
        onClick={() => setFlow({ kind: "clear" })}
      >
        <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
        Effacer toute la programmation
      </button>

      <p className="program-screen__footnote">
        Met toutes les journées sur « Aucune séance ». N'affecte pas les
        semaines passées ni la semaine en cours. Les séances que vous avez
        déplacées, remplacées ou ajoutées restent en place.
      </p>

      {flow?.kind === "day" && (
        <TemplateSheet
          title={weekdayLabels[flow.weekday]}
          message="Un seul modèle par jour. S'applique aux semaines futures."
          templates={activeTemplates}
          durationLabel={durationLabel}
          noneLabel={
            state.program.days.find((day) => day.weekday === flow.weekday)
              ?.sessionTemplateId
              ? "Aucune séance ce jour"
              : undefined
          }
          onPick={(templateId) =>
            void save(
              setWeeklyProgramDay(state.program, flow.weekday, templateId, now()),
            )
          }
          onDismiss={() => setFlow(undefined)}
        />
      )}

      {flow?.kind === "clear" && (
        <BottomSheet
          title="Effacer toute la programmation ?"
          message="Toutes les journées passent sur « Aucune séance » pour les semaines futures. La semaine en cours et le passé ne changent pas."
          actions={[
            {
              label: "Effacer la programmation",
              hint: "Les séances déjà déplacées, remplacées ou ajoutées restent en place",
              tone: "danger",
              onSelect: () =>
                void save({
                  ...createEmptyWeeklyProgram(now()),
                  createdAt: state.program.createdAt,
                }),
            },
          ]}
          onDismiss={() => setFlow(undefined)}
        />
      )}
    </section>
  );
}
