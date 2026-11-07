// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { TestWeekBanner } from "./TestWeekBanner";

/** Programme V5 : le rappel des photos de progression, seulement pendant la semaine de tests. */

const cycle = { anchorWeekStart: "2026-09-27", everyWeeks: 4 };
const PHOTOS = /Photos de progression : face, profil et dos/;

describe("bandeau de semaine de tests — rappel photos", () => {
  afterEach(() => cleanup());

  it("pendant la semaine de tests : le rappel s'affiche", () => {
    render(<MemoryRouter><TestWeekBanner today="2026-11-22" cycle={cycle} /></MemoryRouter>);
    expect(screen.getByText(PHOTOS)).toBeTruthy();
  });

  it("avant la semaine de tests : pas de rappel", () => {
    render(<MemoryRouter><TestWeekBanner today="2026-11-10" cycle={cycle} /></MemoryRouter>);
    expect(screen.getByText(/Semaine de tests dans/)).toBeTruthy();
    expect(screen.queryByText(PHOTOS)).toBeNull();
  });
});
