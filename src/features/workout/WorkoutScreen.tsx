import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Ellipsis,
  Info,
  MinusCircle,
  PauseCircle,
  Play,
  Plus,
} from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  PerformedNoteBlock,
} from "../../domain";
import { listExerciseAlternatives } from "../exercises/exerciseAlternatives";
import { calculateExecutionProgress } from "../../domain/rules/workoutRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  activateBlock,
  addExerciseBlocks,
  addSeries,
  addRound,
  addStep,
  adjustRest,
  editRoundChild,
  editSeries,
  editSimpleMeasurement,
  editStep,
  finishBlock,
  pauseWorkout,
  resumeWorkout,
  skipBlock,
  skipRest,
  substituteExercise,
  substituteGroupChild,
  unskipBlock,
  updateStep,
  validateRoundChild,
  validateSeries,
  validateSimpleMeasurement,
  validateStep,
} from "./engine/workoutEngine";
import { hasCompletedEntries, proposeSeriesValues } from "./engine/workoutBlocks";
import { formatSeriesLine } from "./workoutRecap";
import { formatShortDate } from "./workoutDisplay";
import { getOpenPause, getRestCountdown } from "./engine/workoutTime";
import { ExerciseBlockCard } from "./ExerciseBlockCard";
import { GroupBlockCard } from "./GroupBlockCard";
import { RestBand } from "./RestBand";
import { finishWorkout } from "./finishWorkout";
import { findLastComparableStep } from "./lastPerformance";
import { RestBar } from "./RestBar";
import { RestCard } from "./RestCard";
import { playRestSignal, primeRestSignal } from "./restSignal";
import { useClock, useWorkoutSession } from "./useWorkoutSession";
import { calculatePerformedNumbering, describeNextUp } from "./workoutDisplay";
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
  const [menuOpen, setMenuOpen] = useState(false);
  /* Menu `⋯` d'une brique, puis feuille de remplacement (§13). */
  const [blockMenu, setBlockMenu] = useState<PerformedExerciseBlock | PerformedGroupBlock>();
  const [substitution, setSubstitution] = useState<{
    block: PerformedExerciseBlock | PerformedGroupBlock;
    groupChildId?: Id;
  }>();
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string>();

  const workout = state.status === "ready" ? state.workout : undefined;
  useClock(Boolean(workout?.activeRest));

  /* Signal au premier plan quand le compte à rebours atteint zéro (§12) :
     on observe le passage `running` → `done` du repos en cours. */
  const restPhaseRef = useRef<{ id: string; phase: "running" | "done" } | undefined>(undefined);
  const nowIso = new Date().toISOString();
  const rest = workout?.activeRest;
  const restPhase = rest ? getRestCountdown(rest, nowIso).phase : undefined;

  useEffect(() => {
    if (!rest || !restPhase) {
      restPhaseRef.current = undefined;
      return;
    }

    const previous = restPhaseRef.current;
    restPhaseRef.current = { id: rest.id, phase: restPhase };

    if (
      previous?.id === rest.id &&
      previous.phase === "running" &&
      restPhase === "done" &&
      document.visibilityState === "visible"
    ) {
      playRestSignal();
    }
  }, [rest, restPhase]);

  /* Retour de la bibliothèque : `?add=<id>` dans l'ordre de sélection —
     ou, avec `substitute=<brique>[&child=<enfant>]`, le remplaçant choisi. */
  const pendingAddIds = useMemo(() => searchParams.getAll("add"), [searchParams]);
  const substituteBlockId = searchParams.get("substitute");
  const substituteChildId = searchParams.get("child");
  const handledAddKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.status !== "ready" || pendingAddIds.length === 0) return;

    const key = `${substituteBlockId ?? ""}:${substituteChildId ?? ""}:${pendingAddIds.join(",")}`;
    if (handledAddKey.current === key) return;
    handledAddKey.current = key;

    const exercises = pendingAddIds
      .map((id) => state.exerciseById.get(id))
      .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));

    setSearchParams(new URLSearchParams(), { replace: true });

    if (exercises.length === 0) return;

    /* Versions de cadre actives : capturées à l'ajout et à la substitution (v1.6, § 4.3). */
    const versionIdByExercise = state.frames.versionIdByExercise;

    if (substituteBlockId) {
      const replacement = exercises[0]!;
      const frameVersionId = versionIdByExercise.get(replacement.id);

      void apply((current, at) =>
        substituteChildId
          ? substituteGroupChild(current, substituteBlockId, substituteChildId, replacement, at, frameVersionId)
          : substituteExercise(current, substituteBlockId, replacement, at, frameVersionId),
      );
      return;
    }

    void apply((current, at) => addExerciseBlocks(current, exercises, at, undefined, versionIdByExercise));
  }, [state, pendingAddIds, substituteBlockId, substituteChildId, apply, setSearchParams]);

  /* Une séance qui n'a pas encore de brique courante s'ouvre sur sa
     première brique exécutable (§11 : la brique active dépliée). */
  useEffect(() => {
    if (state.status !== "ready" || state.workout.currentBlockId !== undefined) return;

    const first = [...state.workout.blocks]
      .sort((a, b) => a.position - b.position)
      .find((block) => block.kind !== "note" && block.status === "not_performed");

    if (!first) return;

    void apply((current, at) =>
      current.currentBlockId === undefined ? activateBlock(current, first.id, at) : current,
    );
  }, [state, apply]);

  async function run(action: Parameters<typeof apply>[0]) {
    primeRestSignal();
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

  const { template, exerciseById, lastByExercise, completedWorkouts, rpeScale, frames } = state;
  const name = template?.name ?? "Séance libre";
  const blocks = [...workout.blocks].sort((a, b) => a.position - b.position);
  const numbering = calculatePerformedNumbering(blocks);
  const progress = calculateExecutionProgress(blocks);
  const counts = countBlockStatuses(blocks);
  const hasAdded = blocks.some((block) => block.kind !== "note" && block.addedDuringWorkout);
  const currentNumber =
    workout.currentBlockId !== undefined ? numbering[workout.currentBlockId] : undefined;
  const openPause = getOpenPause(workout);
  const paused = openPause !== undefined;
  const locked = busy || paused;

  /* Deux échelles de repos (§12) : la carte pleine pour la fin de série
     ou de tour, la bande d'une ligne pour `Repos avant cet exercice`. */
  const intraRoundRest = workout.activeRest?.kind === "before_group_child";
  const restBand =
    workout.activeRest && intraRoundRest ? (
      <RestBand
        rest={workout.activeRest}
        now={nowIso}
        busy={busy}
        onSkip={() => void run((current, at) => skipRest(current, at))}
      />
    ) : null;

  /* Carte de repos pleine : dans la brique courante si elle est dépliée,
     sinon au-dessus de la liste. */
  const restCard = workout.activeRest && !intraRoundRest ? (
    <RestCard
      rest={workout.activeRest}
      now={nowIso}
      nextUp={describeNextUp(workout, exerciseById, (block) =>
        proposeSeriesValues(block, lastByExercise.get(block.exerciseId)?.series),
      )}
      paused={paused}
      busy={busy}
      onAdjust={(delta) => void run((current, at) => adjustRest(current, delta, at))}
      onSkip={() => void run((current, at) => skipRest(current, at))}
    />
  ) : null;
  const currentBlock = blocks.find((block) => block.id === workout.currentBlockId);
  const restCardInBlock =
    currentBlock !== undefined &&
    currentBlock.kind !== "note" &&
    isExpanded(currentBlock);

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

  /* Bibliothèque complète, préfiltrée sur la zone du prévu (§13). */
  function openLibraryForSubstitution(
    block: PerformedExerciseBlock | PerformedGroupBlock,
    groupChildId: Id | undefined,
    planned: Exercise | undefined,
  ) {
    setSubstitution(undefined);
    const returnTo = new URLSearchParams();
    returnTo.set("substitute", block.id);
    if (groupChildId) returnTo.set("child", groupChildId);

    const params = new URLSearchParams();
    params.set("mode", "select");
    params.set("single", "1");
    params.set("returnTo", `/seance?${returnTo.toString()}`);
    if (planned?.category === "Musculation") params.append("zone", planned.zone);
    navigate(`/exercises?${params.toString()}`);
  }

  function substitutionTarget(entry: NonNullable<typeof substitution>): {
    current: Exercise | undefined;
    original: Exercise | undefined;
  } {
    if (entry.block.kind === "exercise") {
      return {
        current: exerciseById.get(entry.block.exerciseId),
        original: exerciseById.get(entry.block.originalExerciseId ?? entry.block.exerciseId),
      };
    }

    const child = entry.block.children.find((item) => item.id === entry.groupChildId);
    const pendingRound = entry.block.rounds.find((round) => round.status !== "completed");
    const roundChild = pendingRound?.children.find((item) => item.groupChildId === entry.groupChildId);

    return {
      current: exerciseById.get(roundChild?.exerciseId ?? child?.exerciseId ?? ""),
      original: exerciseById.get(child?.exerciseId ?? ""),
    };
  }

  function describeHistory(exerciseId: Id): string {
    const last = lastByExercise.get(exerciseId);

    return last
      ? `dernière fois ${formatSeriesLine(last.series)} · ${formatShortDate(last.date)}`
      : "jamais réalisé";
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
      const { workout: completed } = await finishWorkout(workout!.id);
      navigate(`/workouts/${completed.id}?returnTo=/`, { replace: true });
    } catch (cause) {
      setFinishing(false);
      setFinishError(cause instanceof Error ? cause.message : "Clôture impossible");
    }
  }

  return (
    <section className={`workout ${workout.activeRest && !intraRoundRest ? "workout--resting" : ""}`}>
      <header className="workout__header">
        <div className="workout__topline">
          <Link to="/" className="workout__back">‹ Aujourd'hui</Link>
          <button
            type="button"
            className="workout__menu"
            aria-label="Actions de la séance"
            onClick={() => setMenuOpen(true)}
          >
            <Ellipsis size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <h1 className="workout__title">
          {name} — {paused ? "En pause" : "En cours"}
        </h1>
        <p className="workout__subtitle">
          Débutée à {formatClock(workout.startedAt)}
          {workout.source === "free" && template ? " · Séance supplémentaire" : ""}
        </p>
      </header>

      {openPause && (
        <div className="workout-pause" role="status">
          <PauseCircle size={20} strokeWidth={2} aria-hidden="true" />
          <span className="workout-pause__text">
            <strong>En pause depuis {formatClock(openPause.startedAt)}</strong>
            <small>La durée active est suspendue ; rien n'est perdu.</small>
          </span>
          <button
            type="button"
            className="workout-pause__resume"
            disabled={busy}
            onClick={() => void run((current, at) => resumeWorkout(current, at))}
          >
            <Play size={16} strokeWidth={2.4} aria-hidden="true" />
            Reprendre la séance
          </button>
        </div>
      )}

      {restCard && !restCardInBlock && restCard}

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
                <GroupBlockCard
                  key={block.id}
                  block={block}
                  number={numbering[block.id]}
                  exerciseById={exerciseById}
                  lastByExercise={lastByExercise}
                  expanded={isExpanded(block)}
                  busy={locked}
                  restCard={block.id === currentBlock?.id && restCardInBlock ? restCard : undefined}
                  restBand={block.id === currentBlock?.id ? restBand : undefined}
                  rpeTable={rpeScale?.table}
                  onToggle={() => toggleBlock(block)}
                  onOpenMenu={() => setBlockMenu(block)}
                  onUnskip={() => void run((current, at) => unskipBlock(current, block.id, at))}
                  onValidateChild={(roundId, childId, values) =>
                    void run((current, at) =>
                      validateRoundChild(current, block.id, roundId, childId, values, at),
                    )
                  }
                  onEditChild={(roundId, childId, values) =>
                    void run((current, at) =>
                      editRoundChild(current, block.id, roundId, childId, values, at),
                    )
                  }
                  onAddRound={() => void run((current, at) => addRound(current, block.id, at))}
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
                busy={locked}
                restCard={block.id === currentBlock?.id && restCardInBlock ? restCard : undefined}
                originalName={
                  block.originalExerciseId
                    ? exerciseById.get(block.originalExerciseId)?.name ?? "exercice supprimé"
                    : undefined
                }
                rpeTable={rpeScale?.table}
                onToggle={() => toggleBlock(block)}
                onOpenMenu={() => setBlockMenu(block)}
                onUnskip={() => void run((current, at) => unskipBlock(current, block.id, at))}
                onValidateSeries={(seriesId, values) =>
                  void run((current, at) => validateSeries(current, block.id, seriesId, values, at))
                }
                onEditSeries={(seriesId, values) =>
                  void run((current, at) => editSeries(current, block.id, seriesId, values, at))
                }
                onAddSeries={() => void run((current, at) => addSeries(current, block.id, at))}
                onFinishBlock={() => void run((current, at) => finishBlock(current, block.id, at))}
                onValidateStep={(stepId, values) =>
                  void run((current, at) => validateStep(current, block.id, stepId, values, at))
                }
                onUpdateStep={(stepId, settings) =>
                  void run((current, at) => updateStep(current, block.id, stepId, settings, at))
                }
                onEditStep={(stepId, values) =>
                  void run((current, at) => editStep(current, block.id, stepId, values, at))
                }
                onAddStep={() => void run((current, at) => addStep(current, block.id, at))}
                onValidateSimple={(values) =>
                  void run((current, at) => validateSimpleMeasurement(current, block.id, values, at))
                }
                onEditSimple={(values) =>
                  void run((current, at) => editSimpleMeasurement(current, block.id, values, at))
                }
                lastComparableStep={(settings) =>
                  findLastComparableStep(block.exerciseId, settings, completedWorkouts, workout.id)
                }
              />
            );
          })}
        </ol>
      )}

      <button type="button" className="workout__add" onClick={() => setAdding(true)} disabled={locked}>
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

      {workout.activeRest && !intraRoundRest && (
        <RestBar
          rest={workout.activeRest}
          now={nowIso}
          busy={busy}
          paused={paused}
          onSkip={() => void run((current, at) => skipRest(current, at))}
        />
      )}

      {blockMenu && (
        <BottomSheet
          title={
            blockMenu.kind === "exercise"
              ? exerciseById.get(blockMenu.exerciseId)?.name ?? "Exercice"
              : blockMenu.name?.trim() || "Groupe"
          }
          message={
            blockMenu.kind === "exercise"
              ? "Sauter n'est ni destructeur ni irréversible ; remplacer garde les consignes prévues."
              : "Remplacer un exercice vaut pour le tour courant et les suivants, jamais pour un tour terminé."
          }
          actions={[
            ...(blockMenu.kind === "exercise"
              ? [
                  {
                    label: blockMenu.originalExerciseId
                      ? "Changer le remplacement"
                      : "Remplacer l'exercice",
                    hint: hasCompletedEntries(blockMenu)
                      ? "Non disponible : un exercice commencé ne se remplace plus, ajoutez-en un à la place"
                      : "Les consignes prévues sont conservées",
                    disabled: hasCompletedEntries(blockMenu),
                    onSelect: () => {
                      const target = blockMenu;
                      setBlockMenu(undefined);
                      setSubstitution({ block: target });
                    },
                  },
                  {
                    label: "Voir la fiche",
                    onSelect: () => navigate(`/exercises/${blockMenu.exerciseId}`, { state: { from: "/seance" } }),
                  },
                ]
              : [...blockMenu.children]
                  .sort((a, b) => a.position - b.position)
                  .map((child, index) => ({
                    label: `Remplacer ${numbering[blockMenu.id] ?? ""}${String.fromCharCode(97 + index)} ${
                      exerciseById.get(child.exerciseId)?.name ?? "Exercice"
                    }`,
                    hint: "À partir du tour courant",
                    onSelect: () => {
                      const target = blockMenu;
                      setBlockMenu(undefined);
                      setSubstitution({ block: target, groupChildId: child.id });
                    },
                  }))),
            {
              label: blockMenu.kind === "exercise" ? "Sauter l'exercice" : "Sauter le groupe",
              hint: "Reste visible, sort du compteur ; annulable jusqu'à la clôture",
              onSelect: () => {
                const target = blockMenu;
                setBlockMenu(undefined);
                void run((current, at) => skipBlock(current, target.id, at));
              },
            },
          ]}
          onDismiss={() => setBlockMenu(undefined)}
        />
      )}

      {substitution &&
        (() => {
          const { current, original } = substitutionTarget(substitution);
          const alternatives = current
            ? listExerciseAlternatives(current, [...exerciseById.values()])
            : [];
          const applyReplacement = (replacement: Exercise) => {
            const target = substitution;
            const frameVersionId = frames.versionIdByExercise.get(replacement.id);
            setSubstitution(undefined);
            void run((now, at) =>
              target.groupChildId
                ? substituteGroupChild(now, target.block.id, target.groupChildId, replacement, at, frameVersionId)
                : substituteExercise(now, target.block.id, replacement, at, frameVersionId),
            );
          };

          return (
            <BottomSheet
              title={`Remplacer ${current?.name ?? "l'exercice"}`}
              message="Les consignes prévues sont conservées ; Dernière fois et Conseillé viendront du nouvel exercice."
              actions={[
                ...alternatives.map((alternative) => ({
                  label: alternative.name,
                  hint: `${alternative.equipment ?? ""} · ${alternative.location} · ${describeHistory(alternative.id)}`,
                  onSelect: () => applyReplacement(alternative),
                })),
                {
                  label: "Choisir dans la bibliothèque",
                  hint: original?.category === "Musculation" ? `Préfiltrée sur la zone ${original.zone}` : "Bibliothèque complète",
                  tone: "primary" as const,
                  onSelect: () => openLibraryForSubstitution(substitution.block, substitution.groupChildId, original),
                },
                ...(original && current && original.id !== current.id
                  ? [
                      {
                        label: `Revenir à ${original.name}`,
                        hint: "Sans réécrire ce qui est déjà fait",
                        onSelect: () => applyReplacement(original),
                      },
                    ]
                  : []),
              ]}
              onDismiss={() => setSubstitution(undefined)}
            />
          );
        })()}

      {menuOpen && (
        <BottomSheet
          title={name}
          message={paused ? "Séance en pause" : "Séance en cours"}
          actions={[
            paused
              ? {
                  label: "Reprendre la séance",
                  hint: "La durée active repart de maintenant",
                  tone: "primary",
                  onSelect: () => {
                    setMenuOpen(false);
                    void run((current, at) => resumeWorkout(current, at));
                  },
                }
              : {
                  label: "Mettre en pause",
                  hint: "Suspend la durée active ; un repos en cours continue mais ne comptera pas dans le repos moyen",
                  onSelect: () => {
                    setMenuOpen(false);
                    void run((current, at) => pauseWorkout(current, at));
                  },
                },
            {
              label: "Terminer la séance",
              hint: "Les exercices restants seront « non réalisés »",
              onSelect: () => {
                setMenuOpen(false);
                setFinishing(true);
              },
            },
          ]}
          dismissLabel="Fermer"
          onDismiss={() => setMenuOpen(false)}
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
              hint: "Nom, zone, mouvement, équipement, type de mesure — il rejoint la bibliothèque",
              onSelect: () => {
                setAdding(false);
                navigate("/seance/exercice-rapide");
              },
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

/**
 * Les trois statuts tels que la clôture les fixera (§14) : une brique
 * commencée compte déjà comme réalisée, avec ses données.
 */
function countBlockStatuses(blocks: PerformedBlock[]) {
  const counts = { performed: 0, skipped: 0, notPerformed: 0 };

  for (const block of blocks) {
    if (block.kind === "note") continue;

    if (block.status === "skipped") counts.skipped += 1;
    else if (block.status === "performed" || hasCompletedEntries(block)) counts.performed += 1;
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
