import { Check } from "lucide-react";
import type { Id } from "../../domain";
import type { Step } from "./workoutSteps";
import "./WorkoutStepper.css";

/** Frise des étapes en tête de la séance : un appui ouvre l'étape. */
export function WorkoutStepper({ steps, onSelect }: { steps: Step[]; onSelect: (id: Id) => void }) {
  if (steps.length === 0) return null;
  return (
    <nav className="wstepper" aria-label="Étapes de la séance">
      <ol>
        {steps.map((step) => (
          <li key={step.id} className={`wstepper__step wstepper__step--${step.state}`}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={step.state === "current" ? "step" : undefined}
              aria-label={`Étape ${step.number} : ${step.label}${step.state === "done" ? " (faite)" : step.state === "skipped" ? " (sautée)" : ""}`}
            >
              <span className="wstepper__dot" aria-hidden="true">
                {step.state === "done" ? <Check size={14} strokeWidth={3} /> : step.number}
              </span>
              <span className="wstepper__label">{step.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
