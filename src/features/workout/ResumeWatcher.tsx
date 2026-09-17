import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import type { Exercise, Id, SessionTemplate, WorkoutSession } from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getInProgressWorkout } from "../../db/repositories/workoutRepository";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { recordWorkoutPresence } from "./engine/persistWorkout";
import { buildResumeSummary, type ResumeSummary } from "./engine/workoutEngine";
import { PRESENCE_HEARTBEAT_SEC, shouldShowResumeSheet } from "./engine/workoutTime";
import { finishWorkout } from "./finishWorkout";
import { formatMmSs } from "./workoutDisplay";
import { formatClock, formatMinutes } from "./workoutRecap";
import "./ResumeWatcher.css";

interface FoundWorkout {
  workout: WorkoutSession;
  summary: ResumeSummary;
  template: SessionTemplate | undefined;
  exerciseById: Map<Id, Exercise>;
}

/**
 * Veille sur la séance en cours (§15, v2.9) : battement de présence
 * toutes les 15 s quand l'application est visible, écriture au départ
 * en arrière-plan, et au retour — ou au lancement — la feuille `Séance
 * en cours retrouvée` après 60 s d'absence, jamais sur une séance en
 * pause. Elle informe ; aucun chrono n'est touché.
 */
export function ResumeWatcher() {
  const navigate = useNavigate();
  const [found, setFound] = useState<FoundWorkout>();
  const [error, setError] = useState<string>();

  const checkOnReturn = useCallback(async () => {
    const now = new Date().toISOString();
    const workout = await getInProgressWorkout();

    if (workout && shouldShowResumeSheet(workout, now)) {
      const [template, exercises] = await Promise.all([
        workout.sessionTemplateId
          ? getSessionTemplate(workout.sessionTemplateId)
          : Promise.resolve(undefined),
        getAllExercises(),
      ]);

      setFound({
        workout,
        summary: buildResumeSummary(workout, now),
        template,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
      });
    }

    /* La présence n'est enregistrée qu'après la lecture de l'absence. */
    await recordWorkoutPresence();
  }, []);

  useEffect(() => {
    /* Au lancement : lecture de l'absence avant le premier battement. */
    const initial = window.setTimeout(() => void checkOnReturn(), 0);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void recordWorkoutPresence();
      }
    }, PRESENCE_HEARTBEAT_SEC * 1000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkOnReturn();
      } else {
        void recordWorkoutPresence();
      }
    };
    const onLeave = () => void recordWorkoutPresence();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [checkOnReturn]);

  if (!found) return null;

  const { workout, summary, template, exerciseById } = found;
  const name = template?.name ?? "Séance libre";
  const current = describeCurrent(workout, exerciseById);

  async function stop() {
    try {
      setError(undefined);
      const completed = await finishWorkout(workout.id);
      setFound(undefined);
      navigate(`/workouts/${completed.id}?returnTo=/`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arrêt impossible");
    }
  }

  return (
    <BottomSheet
      title="Séance en cours retrouvée"
      message={`Vous avez quitté l'app à ${formatClock(summary.leftAt)}. Voulez-vous reprendre votre séance ?`}
      actions={[
        {
          label: "Continuer la séance",
          tone: "primary",
          onSelect: () => {
            setFound(undefined);
            navigate("/seance");
          },
        },
        {
          label: "Arrêter la séance",
          hint: "La séance sera enregistrée avec les exercices restants en « Non réalisé »",
          onSelect: () => void stop(),
        },
      ]}
      dismissLabel="Fermer"
      onDismiss={() => setFound(undefined)}
    >
      <dl className="resume-sheet__facts">
        <div>
          <dt>Séance</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>Commencée à</dt>
          <dd>{formatClock(summary.startedAt)}</dd>
        </div>
        <div>
          <dt>Dernière action</dt>
          <dd>{formatClock(summary.lastActionAt)}</dd>
        </div>
        <div>
          <dt>Durée active</dt>
          <dd>{formatMinutes(summary.activeDurationSec)}</dd>
        </div>
        {current && (
          <div>
            <dt>Exercice en cours</dt>
            <dd>{current}</dd>
          </div>
        )}
        {summary.rest && (
          <div>
            <dt>Repos</dt>
            <dd>
              {summary.rest.phase === "running"
                ? `En cours · restant ${formatMmSs(summary.rest.remainingSec)}`
                : `Terminé · réel ${formatMmSs(summary.rest.elapsedSec)} · prévu ${formatMmSs(summary.rest.plannedDurationSec)}`}
            </dd>
          </div>
        )}
      </dl>

      <p className="resume-sheet__notice">
        <Info size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          Toutes vos données sont enregistrées. Une absence de l'application ne retire rien à la
          durée active ni aux repos : seule une pause explicite le fait.
        </span>
      </p>

      {error && <p className="resume-sheet__error">{error}</p>}
    </BottomSheet>
  );
}

/**
 * `2. Squat barre · Série 2 sur 3` : la brique et l'entrée courantes.
 */
function describeCurrent(
  workout: WorkoutSession,
  exerciseById: Map<Id, Exercise>,
): string | undefined {
  const block = workout.blocks.find((item) => item.id === workout.currentBlockId);

  if (!block || block.kind === "note") return undefined;

  const numbering = [...workout.blocks]
    .filter((item) => item.kind !== "note")
    .sort((a, b) => a.position - b.position);
  const number = numbering.findIndex((item) => item.id === block.id) + 1;

  if (block.kind === "group") {
    const round = block.rounds.find((item) => item.id === workout.currentEntryId);

    return `${number}. ${block.name?.trim() || "Groupe"}${round ? ` · Tour ${round.roundNumber} sur ${block.rounds.length}` : ""}`;
  }

  const exerciseName = exerciseById.get(block.exerciseId)?.name ?? "Exercice";

  if (block.series) {
    const index = block.series.findIndex((series) => series.id === workout.currentEntryId);

    return `${number}. ${exerciseName}${index >= 0 ? ` · Série ${index + 1} sur ${block.series.length}` : ""}`;
  }

  if (block.cardioSteps) {
    const index = block.cardioSteps.findIndex((step) => step.id === workout.currentEntryId);

    return `${number}. ${exerciseName}${index >= 0 ? ` · Palier ${index + 1} sur ${block.cardioSteps.length}` : ""}`;
  }

  return `${number}. ${exerciseName}`;
}
