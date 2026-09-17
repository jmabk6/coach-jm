import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Info, MinusCircle, Plus } from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedBlock,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getInProgressWorkout } from "../../db/repositories/workoutRepository";
import {
  formatExerciseInstructionsRow,
  formatGroupChildInstructionsRow,
} from "../../domain/rules/blockInstructionRules";
import { calculateExecutionProgress } from "../../domain/rules/workoutRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { finishWorkout } from "./finishWorkout";
import { formatClock } from "./workoutRecap";
import "./WorkoutScreen.css";

type LoadState =
  | { status: "loading" }
  | { status: "none" }
  | {
      status: "success";
      workout: WorkoutSession;
      template: SessionTemplate | undefined;
      exerciseById: Map<Id, Exercise>;
    };

/**
 * Séance en cours (§11). Cette première version (Étape 5.1) n'est que la
 * coquille : la liste des briques du snapshot en lecture, et `Terminer la
 * séance` avec sa feuille (§14). La saisie, les repos et l'ajout
 * d'exercices arrivent avec le moteur (Étape 6).
 */
export function WorkoutScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [workout, exercises] = await Promise.all([
        getInProgressWorkout(),
        getAllExercises(),
      ]);

      if (cancelled) return;

      if (!workout) {
        setState({ status: "none" });
        return;
      }

      const template = workout.sessionTemplateId
        ? await getSessionTemplate(workout.sessionTemplateId)
        : undefined;

      if (cancelled) return;

      setState({
        status: "success",
        workout,
        template,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <section className="workout">
        <p className="workout__message">Chargement de la séance…</p>
      </section>
    );
  }

  if (state.status === "none") {
    return (
      <section className="workout">
        <Link to="/" className="workout__back">‹ Aujourd'hui</Link>
        <p className="workout__message">Aucune séance en cours.</p>
      </section>
    );
  }

  const { workout, template, exerciseById } = state;
  const name = template?.name ?? "Séance libre";
  const blocks = [...workout.blocks].sort((a, b) => a.position - b.position);
  const progress = calculateExecutionProgress(blocks);
  const counts = countBlockStatuses(blocks);

  async function finish() {
    try {
      setError(undefined);
      const completed = await finishWorkout(workout.id);
      navigate(`/workouts/${completed.id}?returnTo=/`, { replace: true });
    } catch (cause) {
      setFinishing(false);
      setError(cause instanceof Error ? cause.message : "Clôture impossible");
    }
  }

  return (
    <section className="workout">
      <header className="workout__header">
        <Link to="/" className="workout__back">‹ Aujourd'hui</Link>
        <h1 className="workout__title">{name} — En cours</h1>
        <p className="workout__subtitle">
          Débutée à {formatClock(workout.startedAt)}
          {workout.source === "free" && template ? " · Séance supplémentaire" : ""}
        </p>
      </header>

      {progress.total > 0 && (
        <div className="workout__progress">
          <span className="workout__progress-label">
            Exercice {Math.min(progress.completed + 1, progress.total)} sur{" "}
            {progress.total}
          </span>
          <div
            className="workout__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
          >
            <span
              style={{
                width: `${Math.round((progress.completed / progress.total) * 100)}%`,
              }}
            />
          </div>
          <span className="workout__progress-count">
            {progress.completed}/{progress.total}
          </span>
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="workout__empty">
          <h2>Aucun exercice pour le moment</h2>
          <p>
            Ajoute les exercices au fil de la séance, selon les machines
            disponibles.
          </p>
        </div>
      ) : (
        <ol className="workout__blocks">
          {blocks.map((block) => (
            <BlockRow key={block.id} block={block} exerciseById={exerciseById} />
          ))}
        </ol>
      )}

      <button
        type="button"
        className="workout__add"
        onClick={() =>
          setError("Bientôt : l'ajout d'exercices arrive avec le moteur de séance (Étape 6.2)")
        }
      >
        <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
        Ajouter un exercice
      </button>

      {error && <p className="workout__message workout__message--error">{error}</p>}

      <button
        type="button"
        className="workout__finish"
        onClick={() => setFinishing(true)}
      >
        Terminer la séance
      </button>

      {finishing && (
        <BottomSheet
          title={`Terminer ${name} ?`}
          message="Voici le récapitulatif de cette séance. Elle sera enregistrée telle quelle."
          actions={[
            {
              label: "Terminer la séance",
              tone: "primary",
              onSelect: () => void finish(),
            },
          ]}
          dismissLabel="Continuer la séance"
          onDismiss={() => setFinishing(false)}
        >
          <ul className="workout-finish__counts">
            <li>
              <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
              {plural(counts.performed, "exercice réalisé", "exercices réalisés")}
            </li>
            <li>
              <MinusCircle size={20} strokeWidth={2} aria-hidden="true" />
              {plural(counts.skipped, "exercice sauté", "exercices sautés")}
            </li>
            <li>
              <Circle size={20} strokeWidth={2} aria-hidden="true" />
              {plural(counts.notPerformed, "exercice non réalisé", "exercices non réalisés")}
            </li>
          </ul>
          <p className="workout-notice">
            <Info size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              Les exercices non réalisés resteront enregistrés comme « non
              réalisés » dans cette séance.
              {template
                ? ` Le modèle ${template.name} n'est pas modifié : il sera proposé tel quel lors d'une prochaine séance.`
                : ""}
            </span>
          </p>
        </BottomSheet>
      )}
    </section>
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count <= 1 ? singular : pluralForm}`;
}

function countBlockStatuses(blocks: PerformedBlock[]) {
  const counts = { performed: 0, skipped: 0, notPerformed: 0 };

  for (const block of blocks) {
    if (block.kind === "note") continue;

    if (block.status === "performed") counts.performed += 1;
    else if (block.status === "skipped") counts.skipped += 1;
    else counts.notPerformed += 1;
  }

  return counts;
}

interface BlockRowProps {
  block: PerformedBlock;
  exerciseById: Map<Id, Exercise>;
}

function BlockRow({ block, exerciseById }: BlockRowProps) {
  if (block.kind === "note") {
    return (
      <li className="workout-block workout-block--note">
        <span className="workout-block__name">{block.title?.trim() || "Note"}</span>
        <span className="workout-block__meta">{block.text}</span>
      </li>
    );
  }

  if (block.kind === "group") {
    return (
      <li className="workout-block">
        <span className="workout-block__name">{block.name?.trim() || "Groupe"}</span>
        <span className="workout-block__meta">
          {block.plannedRounds} tours ·{" "}
          {block.children
            .map(
              (child) =>
                `${exerciseById.get(child.exerciseId)?.name ?? "Exercice"} (${formatGroupChildInstructionsRow(child.snapshotInstructions)})`,
            )
            .join(", ")}
        </span>
        <StatusLabel status={block.status} />
      </li>
    );
  }

  return (
    <li className="workout-block">
      <span className="workout-block__name">
        {exerciseById.get(block.exerciseId)?.name ?? "Exercice supprimé"}
      </span>
      <span className="workout-block__meta">
        {formatExerciseInstructionsRow(block.snapshotInstructions)}
      </span>
      <StatusLabel status={block.status} />
    </li>
  );
}

function StatusLabel({ status }: { status: "performed" | "skipped" | "not_performed" }) {
  const label =
    status === "performed" ? "Terminé" : status === "skipped" ? "Sauté" : "À venir";

  return <span className={`workout-block__status workout-block__status--${status}`}>{label}</span>;
}
