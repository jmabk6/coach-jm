import { useCallback, useEffect, useState } from "react";
import type {
  Exercise,
  StrengthArchiveReason,
  StrengthFrame,
  StrengthFrameVersion,
  StrengthMilestone,
  WorkoutSession,
} from "../../domain";
import {
  getStrengthFrameByExercise,
  getStrengthFrameVersions,
  getStrengthMilestonesByVersion,
} from "../../db/repositories/strengthRepository";
import {
  detectStagnation,
  formatFrameValidation,
  formatFrameVersionSummary,
  formatStrengthValue,
  frameTypesFor,
  isVersionFrozen,
  proposeRaise,
  strengthArchiveReasonLabels,
  strengthProgressionTypeLabels,
} from "../../domain/rules/strengthRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { formatSeconds } from "../workout/workoutRecap";
import {
  acceptRaise,
  archiveFrameVersion,
  createFrame,
  startNextVersion,
  updateFrameVersion,
  type FrameVersionInput,
  type StartingTarget,
} from "./frameActions";
import { FrameForm, type FrameFormMode } from "./FrameForm";
import { currentLoadOf, lastSessionOutcome, latestMilestone, proposeStartingLoad } from "./frameReadings";
import "./FrameSection.css";

interface FrameSectionProps {
  exercise: Exercise;
  /** Séances terminées, chargées par la fiche : charge en cours, dernière séance, proposition. */
  completedWorkouts: WorkoutSession[];
}

interface FrameState {
  frame: StrengthFrame;
  versions: StrengthFrameVersion[];
  /** La version pointée par le cadre : active, ou archivée en attente d'une suivante. */
  current: StrengthFrameVersion;
  milestones: StrengthMilestone[];
}

type LoadState = { status: "loading" } | { status: "none" } | ({ status: "ready" } & FrameState);

const ARCHIVE_REASONS: StrengthArchiveReason[] = ["plafond_atteint", "erreur_calibration", "changement_materiel"];

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function formatIsoDate(iso: string): string {
  return formatDate(iso.slice(0, 10));
}

/* « Rester sur le palier » n'écrit rien dans le modèle (spec § 7) : la
   proposition s'éteint d'elle-même à la séance suivante. Pour ne pas la
   remontrer à chaque ouverture d'ici là, le refus est mémorisé dans le
   navigateur seulement — jamais dans la base ni la sauvegarde. */
const DISMISSED_KEY = "coach-jm:hausse-refusee";

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberDismissed(milestoneId: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), milestoneId]));
  } catch {
    /* stockage indisponible : l'encart réapparaîtra, sans conséquence */
  }
}

/**
 * Section « Cadre de progression » de la fiche exercice (plan lot 4,
 * décision 1 ; conception v1.6 § 4.2, § 4.2 bis) : créer le cadre,
 * lire ses paramètres et son état de figeage, les deux valeurs
 * distinctes — dernier jalon validé et charge en cours —, l'objectif en
 * cours, le sort de la dernière séance, l'historique des versions ;
 * modifier, archiver, repartir sur une nouvelle version.
 */
export function FrameSection({ exercise, completedWorkouts }: FrameSectionProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [form, setForm] = useState<FrameFormMode>();
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const frame = await getStrengthFrameByExercise(exercise.id);
      if (cancelled) return;

      if (!frame) {
        setState({ status: "none" });
        return;
      }

      const versions = await getStrengthFrameVersions(frame.id);
      const current = versions.find((version) => version.id === frame.activeVersionId) ?? versions[versions.length - 1];

      if (!current) {
        if (!cancelled) setState({ status: "none" });
        return;
      }

      const milestones = await getStrengthMilestonesByVersion(current.id);
      if (!cancelled) setState({ status: "ready", frame, versions, current, milestones });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [exercise.id, revision]);

  const types = frameTypesFor(exercise);

  if (exercise.category !== "Musculation") return null;

  async function run(action: () => Promise<string | undefined>) {
    setBusy(true);
    setError(undefined);
    try {
      const message = await action();
      setForm(undefined);
      setArchiving(false);
      setNotice(message);
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  function submit(input: FrameVersionInput, startingTarget: StartingTarget | undefined) {
    if (form === "create") {
      void run(async () => {
        await createFrame(exercise, input, startingTarget);
        return "Cadre créé. Il sera capturé au démarrage de vos prochaines séances.";
      });
      return;
    }

    if (state.status !== "ready") return;
    const { frame } = state;

    if (form === "edit") {
      void run(async () => {
        const outcome = await updateFrameVersion(exercise, frame, input);
        return outcome.kind === "new_version"
          ? `Version ${outcome.version.number} créée ; la version ${outcome.archived.number} est archivée avec son historique.`
          : "Version modifiée.";
      });
      return;
    }

    void run(async () => {
      const version = await startNextVersion(exercise, frame, input, startingTarget);
      return `Version ${version.number} créée, sans jalon : la progression repart.`;
    });
  }

  if (types.length === 0) {
    return (
      <section className="exercise-detail__section frame-section">
        <h2>Cadre de progression</h2>
        <p className="frame-section__muted">
          Pas de cadre possible pour ce type de mesure en V1 : les cadres suivent une charge, une assistance ou une durée.
        </p>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="exercise-detail__section frame-section">
        <h2>Cadre de progression</h2>
        <p className="frame-section__muted">Chargement…</p>
      </section>
    );
  }

  const proposedStart = proposeStartingLoad(exercise, completedWorkouts);

  if (state.status === "none") {
    return (
      <section className="exercise-detail__section frame-section">
        <h2>Cadre de progression</h2>
        {form === "create" ? (
          <FrameForm
            exercise={exercise}
            mode="create"
            proposedStart={proposedStart}
            askStartingLoad
            busy={busy}
            error={error}
            onSubmit={submit}
            onCancel={() => setForm(undefined)}
          />
        ) : (
          <>
            <p className="frame-section__muted">
              Aucun cadre : cet exercice se note comme aujourd'hui, sans validation de palier. Un cadre fixe les règles
              (séries, plage, RPE cible, repos, incrément) ; la charge, elle, évolue à l'intérieur.
            </p>
            {notice && <p className="frame-section__notice">{notice}</p>}
            <button type="button" className="frame-section__primary" onClick={() => setForm("create")}>
              Créer un cadre de progression
            </button>
          </>
        )}
      </section>
    );
  }

  const { frame, versions, current, milestones } = state;
  const unit = current.progressionType === "duree_croissante" ? "sec" : "kg";
  const last = latestMilestone(milestones);
  const currentLoad = currentLoadOf(exercise.id, unit, completedWorkouts);
  const outcome = lastSessionOutcome(current, completedWorkouts);
  const archived = current.status === "archived";
  const frozen = isVersionFrozen(current);
  /* Suggestions (spec § 7, v1.6 § 4.6) : dérivées, jamais stockées. */
  const raise = proposeRaise(current, milestones, completedWorkouts);
  const raiseVisible = raise && !dismissed.includes(raise.milestone.id);
  const stagnation = detectStagnation(current, completedWorkouts, milestones);
  const summary = [
    formatFrameVersionSummary(current),
    `repos ${formatSeconds(current.restSec)}`,
    `${current.progressionType === "assistance_decroissante" ? "−" : "+"}${formatStrengthValue(current.increment.value, current.increment.unit)}`,
    ...(current.barWeightKg !== undefined ? [`barre ${formatStrengthValue(current.barWeightKg, "kg")}`] : []),
  ].join(" · ");

  return (
    <section className="exercise-detail__section frame-section">
      <h2>Cadre de progression</h2>

      <p className="frame-section__summary">
        <strong>
          V{current.number} · {strengthProgressionTypeLabels[current.progressionType]}
        </strong>
        <span>{summary}</span>
      </p>

      <p className={`frame-section__freeze ${archived ? "frame-section__freeze--archived" : ""}`}>
        {archived
          ? `Archivée le ${formatIsoDate(current.archivedAt ?? current.updatedAt)}${
              current.archiveReason ? ` — ${strengthArchiveReasonLabels[current.archiveReason]}` : ""
            }. Créez une nouvelle version pour reprendre.`
          : frozen
            ? `Figée depuis le ${formatIsoDate(current.frozenAt ?? current.updatedAt)} : modifier un paramètre créera la version ${current.number + 1}.`
            : "Modifiable librement : aucune séance terminée ne l'a encore utilisée."}
      </p>

      <div className="exercise-detail__performance-cards frame-section__cards">
        <article className="exercise-detail__performance-card">
          <small>Dernier jalon validé</small>
          {last ? (
            <>
              <strong>{formatStrengthValue(last.value, last.unit)}</strong>
              <span>
                {formatDate(last.date)}
                {last.ceilingReached ? " · plafond atteint" : ""}
              </span>
            </>
          ) : (
            <>
              <strong className="frame-section__empty">Aucun jalon validé</strong>
              <span>{milestones.length === 0 ? "sous cette version" : ""}</span>
            </>
          )}
        </article>
        <article className="exercise-detail__performance-card">
          <small>
            {unit === "sec"
              ? "Durée en cours"
              : current.progressionType === "assistance_decroissante"
                ? "Assistance en cours"
                : "Charge en cours"}
          </small>
          {currentLoad ? (
            <>
              <strong>{formatStrengthValue(currentLoad.value, currentLoad.unit)}</strong>
              <span>dernière séance {formatDate(currentLoad.date)}</span>
            </>
          ) : (
            <>
              <strong className="frame-section__empty">—</strong>
              <span>aucune séance de cet exercice</span>
            </>
          )}
        </article>
      </div>

      {current.currentTarget && !archived && (
        <p className="frame-section__target">
          Objectif : <strong>{formatStrengthValue(current.currentTarget.value, current.currentTarget.unit)}</strong>
          {current.currentTarget.fromMilestoneId
            ? ` — hausse acceptée le ${formatIsoDate(current.currentTarget.acceptedAt)}`
            : ` — charge de départ confirmée le ${formatIsoDate(current.currentTarget.acceptedAt)}`}
        </p>
      )}

      {outcome && (
        <p className={`frame-section__outcome ${outcome.result.validated ? "frame-section__outcome--ok" : ""}`}>
          Dernière séance ({formatDate(outcome.date)}) : {formatFrameValidation(outcome.result, current.workSets)}
        </p>
      )}

      {raise && raiseVisible && (
        <aside className="frame-section__suggestion" aria-label="Hausse proposée">
          <strong>Augmentation proposée</strong>
          <p>
            Palier {formatStrengthValue(raise.milestone.value, raise.unit)} validé le {formatDate(raise.milestone.date)}.
            Cran suivant : <strong>{formatStrengthValue(raise.value, raise.unit)}</strong>
            {raise.repFloor !== undefined ? `, en repartant du bas de la plage (${raise.repFloor} répétitions)` : ""}.
            Rien ne change tant que vous n'acceptez pas.
          </p>
          <div className="frame-section__actions">
            <button
              type="button"
              className="frame-section__primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await acceptRaise(current, raise);
                  return `Objectif ${formatStrengthValue(raise.value, raise.unit)} enregistré pour la prochaine séance.`;
                })
              }
            >
              Accepter le nouveau palier
            </button>
            <button
              type="button"
              className="frame-section__secondary"
              disabled={busy}
              onClick={() => {
                rememberDismissed(raise.milestone.id);
                setDismissed((items) => [...items, raise.milestone.id]);
              }}
            >
              Rester à {formatStrengthValue(raise.milestone.value, raise.unit)}
            </button>
          </div>
        </aside>
      )}

      {stagnation && (
        <aside className="frame-section__suggestion frame-section__suggestion--warn" aria-label="Stagnation à examiner">
          <strong>Stagnation à examiner</strong>
          <p>
            Trois séances à {formatStrengthValue(stagnation.load, stagnation.unit)} sans progrès sur le total
            {stagnation.unit === "sec" ? " de secondes" : " de répétitions"} :
          </p>
          <ul>
            {stagnation.sessions.map((session) => (
              <li key={session.workoutId}>
                {formatDate(session.date)} — total {session.total}
                {stagnation.unit === "sec" ? " s" : " reps"}
              </li>
            ))}
          </ul>
          <p>
            Pistes, sans décision : revenir au cran précédent, poursuivre, vérifier le repos. Réduire le nombre de
            séries serait un changement de cadre (« Modifier »), pas un ajustement de charge.
          </p>
        </aside>
      )}

      {notice && <p className="frame-section__notice">{notice}</p>}

      {form ? (
        <FrameForm
          exercise={exercise}
          mode={form}
          initial={current}
          proposedStart={proposedStart}
          askStartingLoad={form === "next"}
          busy={busy}
          error={error}
          onSubmit={submit}
          onCancel={() => {
            setForm(undefined);
            setError(undefined);
          }}
        />
      ) : (
        <div className="frame-section__actions">
          {archived ? (
            <button type="button" className="frame-section__primary" onClick={() => setForm("next")}>
              Nouvelle version
            </button>
          ) : (
            <>
              <button type="button" className="frame-section__secondary" onClick={() => setForm("edit")}>
                Modifier
              </button>
              <button type="button" className="frame-section__secondary" onClick={() => setArchiving(true)}>
                Archiver
              </button>
            </>
          )}
        </div>
      )}

      {error && !form && (
        <p className="frame-form__error" role="alert">
          {error}
        </p>
      )}

      {versions.length > 1 && (
        <ul className="frame-section__history" aria-label="Versions du cadre">
          {[...versions].reverse().map((version) => (
            <li key={version.id}>
              <span>
                V{version.number} · {formatFrameVersionSummary(version)}
              </span>
              <small>
                {version.status === "active"
                  ? "active"
                  : `archivée le ${formatIsoDate(version.archivedAt ?? version.updatedAt)}${
                      version.archiveReason ? ` · ${strengthArchiveReasonLabels[version.archiveReason]}` : " · remplacée"
                    }`}
              </small>
            </li>
          ))}
        </ul>
      )}

      {archiving && (
        <BottomSheet
          title={`Archiver la version ${current.number}`}
          message="La version garde son historique et ses jalons ; la progression repartira sur une nouvelle version. Une stagnation n'est pas un motif d'archivage."
          actions={ARCHIVE_REASONS.map((reason) => ({
            label: strengthArchiveReasonLabels[reason],
            tone: "danger" as const,
            onSelect: () => {
              void run(async () => {
                await archiveFrameVersion(frame, reason);
                return `Version ${current.number} archivée (${strengthArchiveReasonLabels[reason].toLowerCase()}).`;
              });
            },
          }))}
          onDismiss={() => setArchiving(false)}
        />
      )}
    </section>
  );
}
