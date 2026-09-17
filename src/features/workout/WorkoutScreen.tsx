import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle, Info, MinusCircle, Plus } from "lucide-react";
import type {
  Id,
  PerformedBlock,
  PerformedGroupBlock,
  PerformedNoteBlock,
} from "../../domain";
import { calculateExecutionProgress } from "../../domain/rules/workoutRules";
import { formatGroupChildInstructionsRow } from "../../domain/rules/blockInstructionRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  activateBlock,
  addExerciseBlocks,
  addSeries,
  editSeries,
  skipRest,
  validateSeries,
} from "./engine/workoutEngine";
import { ExerciseBlockCard } from "./ExerciseBlockCard";
import { finishWorkout } from "./finishWorkout";
import { RestBar } from "./RestBar";
import { useClock, useWorkoutSession } from "./useWorkoutSession";
import { calculatePerformedNumbering } from "./workoutDisplay";
import { formatClock } from "./workoutRecap";
import "./WorkoutScreen.css";
import "./WorkoutBlocks.css";

/**
 * Séance en cours (§11, mockups 15–16) : liste déroulante de toutes les
 * briques, la brique courante dépliée, les autres repliées sur leur
 * résumé. Chaque geste passe par le moteur et est sauvegardé aussitôt ;
 * l'écran ne calcule rien lui-même.
 */
export function WorkoutScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, apply, error, clearError } = useWorkoutSession();
  const [busy, setBusy] = useState(false);
  const [peekedId, setPeekedId] = useState<Id>();
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string>();

  const workout = state.status === "ready" ? state.workout : undefined;
  useClock(Boolean(workout?.activeRest));

  /* Retour de la bibliothèque : `?add=<id>` dans l'ordre de sélection. */
  const pendingAddIds = useMemo(() => searchParams.getAll("add"), [searchParams]);
  const handledAddKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.status !== "ready" || pendingAddIds.length === 0) return;

    const key = pendingAddIds.join(",");
    if (handledAddKey.current === key) return;
    handledAddKey.current = key;

    const exercises = pendingAddIds
      .map((id) => state.exerciseById.get(id))
      .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));

    setSearchParams(new URLSearchParams(), { replace: true });

    if (exercises.length === 0) return;

    void apply((current, at) => addExerciseBlocks(current, exercises, at));
  }, [state, pendingAddIds, apply, setSearchParams]);

  async function run(action: Parameters<typeof apply>[0]) {
    setBusy(true);
    try {
      await apply(action);
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return (
      <section className="workout">
        <p className="workout__message">Chargement de la séance…</p>
      </section>
    );
  }

  if (state.status === "none" || !workout) {
    return (
      <section className="workout">
        <Link to="/" className="workout__back">‹ Aujourd'hui</Link>
        <p className="workout__message">Aucune séance en cours.</p>
      </section>
    );
  }

  const { template, exerciseById, lastByExercise } = state;
  const name = template?.name ?? "Séance libre";
  const blocks = [...workout.blocks].sort((a, b) => a.position - b.position);
  const numbering = calculatePerformedNumbering(blocks);
  const progress = calculateExecutionProgress(blocks);
  const counts = countBlockStatuses(blocks);
  const hasAdded = blocks.some((block) => block.kind !== "note" && block.addedDuringWorkout);
  const currentNumber =
    workout.currentBlockId !== undefined ? numbering[workout.currentBlockId] : undefined;

  function openLibrary() {
    setAdding(false);
    const params = new URLSearchParams();
    params.set("mode", "select");
    params.set("returnTo", "/seance");
    for (const block of blocks) {
      if (block.kind === "exercise") params.append("alreadyAdded", block.exerciseId);
      if (block.kind === "group") {
        block.children.forEach((child) => params.append("alreadyAdded", child.exerciseId));
      }
    }
    navigate(`/exercises?${params.toString()}`);
  }

  function toggleBlock(block: PerformedBlock) {
    if (block.kind === "note") return;

    const isCurrent = workout!.currentBlockId === block.id;

    if (block.status === "not_performed") {
      if (isCurrent) {
        setPeekedId((value) => (value === `closed:${block.id}` ? undefined : `closed:${block.id}`));
        return;
      }
      setPeekedId(undefined);
      void run((current, at) => activateBlock(current, block.id, at));
      return;
    }

    setPeekedId((value) => (value === block.id ? undefined : block.id));
  }

  function isExpanded(block: PerformedBlock): boolean {
    if (block.kind === "note") return false;
    if (workout!.currentBlockId === block.id && block.status === "not_performed") {
      return peekedId !== `closed:${block.id}`;
    }
    return peekedId === block.id;
  }

  async function finish() {
    try {
      setFinishError(undefined);
      const completed = await finishWorkout(workout!.id);
      navigate(`/workouts/${completed.id}?returnTo=/`, { replace: true });
    } catch (cause) {
      setFinishing(false);
      setFinishError(cause instanceof Error ? cause.message : "Clôture impossible");
    }
  }

  return (
    <section className={`workout ${workout.activeRest ? "workout--resting" : ""}`}>
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
            {currentNumber !== undefined && progress.completed < progress.total
              ? `Exercice ${Math.min(currentNumber, progress.total)} sur ${progress.total}`
              : `${progress.completed} sur ${progress.total}`}
          </span>
          <div
            className="workout__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
          >
            <span style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }} />
          </div>
          <span className="workout__progress-count">
            {progress.completed}/{progress.total}
          </span>
        </div>
      )}

      {(error || finishError) && (
        <p className="workout__message workout__message--error" onClick={clearError}>
          {error ?? finishError}
        </p>
      )}

      {blocks.length === 0 ? (
        <div className="workout__empty">
          <h2>Aucun exercice pour le moment</h2>
          <p>Ajoute les exercices au fil de la séance, selon les machines disponibles.</p>
        </div>
      ) : (
        <ol className="workout__blocks">
          {blocks.map((block) => {
            if (block.kind === "note") {
              return <NoteRow key={block.id} block={block} />;
            }

            if (block.kind === "group") {
              return (
                <GroupRow
                  key={block.id}
                  block={block}
                  number={numbering[block.id]}
                  exerciseName={(id) => exerciseById.get(id)?.name ?? "Exercice"}
                />
              );
            }

            return (
              <ExerciseBlockCard
                key={block.id}
                block={block}
                number={numbering[block.id]}
                exercise={exerciseById.get(block.exerciseId)}
                lastTime={lastByExercise.get(block.exerciseId)}
                expanded={isExpanded(block)}
                busy={busy}
                onToggle={() => toggleBlock(block)}
                onValidateSeries={(seriesId, values) =>
                  void run((current, at) => validateSeries(current, block.id, seriesId, values, at))
                }
                onEditSeries={(seriesId, values) =>
                  void run((current, at) => editSeries(current, block.id, seriesId, values, at))
                }
                onAddSeries={() => void run((current, at) => addSeries(current, block.id, at))}
              />
            );
          })}
        </ol>
      )}

      <button type="button" className="workout__add" onClick={() => setAdding(true)} disabled={busy}>
        <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
        Ajouter un exercice
      </button>

      {hasAdded && (
        <p className="workout-notice">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            {template
              ? `Les exercices ajoutés pendant la séance n'apparaissent pas au modèle ${template.name}. Ils sont enregistrés uniquement dans cette séance.`
              : "Les exercices ajoutés sont enregistrés dans cette séance ; aucun modèle n'est modifié."}
          </span>
        </p>
      )}

      <button type="button" className="workout__finish" onClick={() => setFinishing(true)}>
        Terminer la séance
      </button>

      {workout.activeRest && (
        <RestBar
          rest={workout.activeRest}
          now={new Date().toISOString()}
          busy={busy}
          onSkip={() => void run((current, at) => skipRest(current, at))}
        />
      )}

      {adding && (
        <BottomSheet
          title="Ajouter un exercice"
          message="Il rejoint cette séance seulement ; le modèle n'est pas modifié."
          actions={[
            {
              label: "Choisir dans la bibliothèque",
              hint: "Ajouter un ou plusieurs exercices",
              tone: "primary",
              onSelect: openLibrary,
            },
            {
              label: "Créer un exercice rapide",
              hint: "Bientôt : étape 6.7 (nom, zone, mouvement, équipement, type de mesure)",
              disabled: true,
              onSelect: () => undefined,
            },
          ]}
          onDismiss={() => setAdding(false)}
        />
      )}

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
              Les exercices non réalisés resteront enregistrés comme « non réalisés » dans cette
              séance.
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

function NoteRow({ block }: { block: PerformedNoteBlock }) {
  return (
    <li className="wblock wblock--note">
      <div className="wblock__head wblock__head--static">
        <span className="wblock__body">
          <span className="wblock__name">{block.title?.trim() || "Note"}</span>
          <span className="wblock__meta wblock__meta--wrap">{block.text}</span>
        </span>
      </div>
    </li>
  );
}

function GroupRow({
  block,
  number,
  exerciseName,
}: {
  block: PerformedGroupBlock;
  number: number | undefined;
  exerciseName: (id: Id) => string;
}) {
  const children = [...block.children].sort((a, b) => a.position - b.position);

  return (
    <li className="wblock">
      <div className="wblock__head wblock__head--static">
        <span className="wblock__body">
          <span className="wblock__name">
            {number !== undefined ? `${number}. ` : ""}
            {block.name?.trim() || "Groupe"}
          </span>
          <span className="wblock__meta wblock__meta--wrap">
            {block.plannedRounds} tours ·{" "}
            {children
              .map(
                (child, index) =>
                  `${number ?? ""}${String.fromCharCode(97 + index)} ${exerciseName(child.exerciseId)} (${formatGroupChildInstructionsRow(child.snapshotInstructions)})`,
              )
              .join(", ")}
          </span>
          <span className="wblock__soon">L'exécution tour par tour arrive à l'étape 6.6.</span>
        </span>
        <span className="wblock__aside">
          <span className="wblock__status">À venir</span>
        </span>
      </div>
    </li>
  );
}
