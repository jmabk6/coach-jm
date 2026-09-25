// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { ageOn, formatHeight, parseProfileInput, profileSummary } from "../../domain/rules/profileRules";
import { ProfileScreen } from "./ProfileScreen";

/** Lot L.1 — profil : prénom, date de naissance facultative (âge au jour près, D24), taille ; pas de photo. */

describe("âge et taille", () => {
  it("âge au jour près : la veille, le jour et le lendemain de l'anniversaire", () => {
    expect(ageOn("1968-09-26", "2026-09-25")).toBe(57);
    expect(ageOn("1968-09-26", "2026-09-26")).toBe(58);
    expect(ageOn("1968-09-26", "2026-09-27")).toBe(58);
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
    expect(ageOn(undefined, "2026-09-25")).toBeUndefined();
    expect(ageOn("2030-01-01", "2026-09-25")).toBeUndefined();
  });

  it("taille en mètres ; saisie en m ou en cm ; résumé de ce qui est connu", () => {
    expect(formatHeight(177)).toBe("1,77 m");
    expect(parseProfileInput({ firstName: " Jean-Michel ", birthDate: "", height: "1,77" }, "2026-09-25")).toEqual({
      ok: true,
      profile: { firstName: "Jean-Michel", heightCm: 177 },
    });
    expect(parseProfileInput({ firstName: "", birthDate: "", height: "177" }, "2026-09-25")).toMatchObject({ ok: true, profile: { heightCm: 177 } });
    expect(parseProfileInput({ firstName: "", birthDate: "", height: "40" }, "2026-09-25")).toMatchObject({ ok: false });
    expect(parseProfileInput({ firstName: "", birthDate: "2030-01-01", height: "" }, "2026-09-25")).toMatchObject({ ok: false });
    expect(profileSummary({ birthDate: "1968-01-10", heightCm: 177 }, "2026-09-25")).toBe("58 ans | 1,77 m");
    expect(profileSummary({ heightCm: 177 }, "2026-09-25")).toBe("1,77 m");
  });
});

describe("écran Mon profil", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T10:00:00"));
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 50));
    db.close();
    await db.delete();
  });

  it("profil vide : « Ajouter mes informations » ; saisie enregistrée, âge calculé", async () => {
    render(
      <MemoryRouter>
        <ProfileScreen />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Ajouter mes informations/ }));
    fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Jean-Michel" } });
    fireEvent.change(screen.getByLabelText("Date de naissance (facultative)"), { target: { value: "1968-01-10" } });
    fireEvent.change(screen.getByLabelText("Taille (m ou cm)"), { target: { value: "1,77" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("58 ans | 1,77 m")).toBeDefined();
    await waitFor(async () =>
      expect((await db.settings.get("profile"))?.value).toEqual({ firstName: "Jean-Michel", birthDate: "1968-01-10", heightCm: 177 }),
    );
    expect(document.querySelector("img")).toBeNull();
  });
});
