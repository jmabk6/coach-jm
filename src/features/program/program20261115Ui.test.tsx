// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionTemplate, WorkoutSession } from "../../domain";
import { SeriesForm } from "../workout/SeriesForm";
import { FreeWorkoutRow } from "./PlannedSessionRow";
import { FreeWorkoutMenu } from "./ProgramSheets";

/** Programme 4+2, lot 2 : « par jambe » à la saisie, nom des séances libres au planning. */

afterEach(cleanup);

describe("presse à une jambe : répétitions par jambe", () => {
  it("charge × répétitions avec libellé : le champ dit « Reps par jambe (la plus faible) »", () => {
    render(<SeriesForm layout="load_reps" initial={{}} sideRepsUnit="Reps par jambe (la plus faible)" submitLabel="Valider" onSubmit={() => undefined} />);
    expect(screen.getByText("Reps par jambe (la plus faible)")).toBeTruthy();
  });

  it("sans libellé : « Reps », comme avant", () => {
    render(<SeriesForm layout="load_reps" initial={{}} submitLabel="Valider" onSubmit={() => undefined} />);
    expect(screen.getByText("Reps")).toBeTruthy();
  });
});

describe("séance faite hors planning : son nom au planning", () => {
  const workout = {
    id: "w", source: "free", sessionTemplateId: "libre-souplesse", status: "completed", date: "2026-11-16",
    startedAt: "2026-11-16T19:00:00.000Z", completedAt: "2026-11-16T19:22:00.000Z", lastActionAt: "x", activeDurationSec: 1320, createdAt: "x", updatedAt: "x", blocks: [],
  } as unknown as WorkoutSession;
  const template = { id: "libre-souplesse", name: "Souplesse", category: "Routine" } as SessionTemplate;

  it("lancée depuis Souplesse : « Souplesse », badge Faite · Libre", () => {
    render(<MemoryRouter><FreeWorkoutRow workout={workout} exerciseById={new Map()} template={template} onOpenMenu={() => undefined} /></MemoryRouter>);
    expect(screen.getByText("Souplesse")).toBeTruthy();
    expect(screen.getByText("Faite · Libre")).toBeTruthy();
  });

  it("sans modèle : « Séance libre », comme avant", () => {
    render(<MemoryRouter><FreeWorkoutRow workout={{ ...workout, sessionTemplateId: undefined } as unknown as WorkoutSession} exerciseById={new Map()} onOpenMenu={() => undefined} /></MemoryRouter>);
    expect(screen.getByText("Séance libre")).toBeTruthy();
  });

  it("menu : titre au nom de la séance", () => {
    render(<MemoryRouter><FreeWorkoutMenu workout={workout} name="Souplesse" onOpenRecap={() => undefined} onDismiss={() => undefined} /></MemoryRouter>);
    expect(screen.getByText(/Souplesse/)).toBeTruthy();
  });
});
