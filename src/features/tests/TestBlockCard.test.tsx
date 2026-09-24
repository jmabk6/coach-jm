// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PerformedTestBlock, WorkoutSession } from "../../domain";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { seedSettingsDefaults } from "../seed/seedSettingsDefaults";
import type { WorkoutAction } from "../workout/engine/persistWorkout";
import { seedTestProtocols } from "./seedTestProtocols";
import { TestBlockCard } from "./TestBlockCard";

/**
 * Lot G.4 — écran de la brique test : essais de traction avec repos de
 * 3 min, relevés cardio, sprints (unité fixée au premier test, D17),
 * souplesse signée, résultat calculé en direct (§ 5.3, D28, N9).
 */

const T = "2026-10-25T09:00:00.000Z";

function testBlock(key: string): PerformedTestBlock {
  return {
    id: `workout-block-test-protocol-${key}`, kind: "test", position: 0, addedDuringWorkout: false, status: "not_performed",
    protocolId: `protocol-${key}`, protocolVersionId: `protocol-${key}-v1`,
  };
}

/* La séance du montage, relue par les assertions (écrite après chaque rendu). */
const seen: { workout?: WorkoutSession } = {};
const onFinish = vi.fn();

function Harness({ keyName, editable = true }: { keyName: string; editable?: boolean }) {
  const [workout, setWorkout] = useState<WorkoutSession>({
    id: "w", source: "planned", kind: "training", status: "in_progress", date: "2026-10-25", startedAt: T, lastActionAt: T,
    activeDurationSec: 0, createdAt: T, updatedAt: T, blocks: [testBlock(keyName)],
  });
  useEffect(() => {
    seen.workout = workout;
  }, [workout]);
  const apply = (action: WorkoutAction) => setWorkout((current) => action(current, new Date().toISOString()));
  return (
    <ul>
      <TestBlockCard block={workout.blocks[0] as PerformedTestBlock} number={2} expanded busy={false} editable={editable} apply={apply} onFinish={onFinish} />
    </ul>
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedSettingsDefaults(new Date(T));
  await db.transaction("rw", db.exercises, () => seedExerciseCatalog());
  await seedTestProtocols(T);
  onFinish.mockReset();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

const result = () => screen.getByRole("region", { name: "Résultat" });
const draft = () => (seen.workout!.blocks[0] as PerformedTestBlock).draft;

function type(label: string | RegExp, value: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe("traction : essais dégressifs", () => {
  it("40 kg réussi, 38 réussi, 36 échec : assistance minimale 38 kg ; proposition et repos entre deux essais", async () => {
    render(<Harness keyName="traction" />);
    expect(await screen.findByText("2. Test traction assistée")).toBeTruthy();
    expect(screen.getByText("Premier essai à 40 kg d'assistance.")).toBeTruthy();

    const field = () => screen.getByRole("textbox", { name: /assistance \(kg\)/ }) as HTMLInputElement;
    expect(field().value).toBe("40");
    fireEvent.click(screen.getByRole("button", { name: "Réussi" }));

    await waitFor(() => expect(field().value).toBe("38"));
    expect(screen.getByRole("timer").textContent).toMatch(/^Repos : (3:00|2:5\d) avant l'essai suivant$/);
    fireEvent.click(screen.getByRole("button", { name: "Réussi" }));
    await waitFor(() => expect(field().value).toBe("36"));
    fireEvent.click(screen.getByRole("button", { name: "Échec" }));

    await screen.findByText("Premier échec atteint : le test est fini.");
    expect(draft()?.trials?.map((trial) => [trial.value, trial.outcome, trial.restSec])).toEqual([
      [40, "success", 180], [38, "success", 180], [36, "failure", 180],
    ]);
    expect(within(result()).getByRole("heading").textContent).toBe("Résultat");
    expect(within(result()).getByText("Assistance minimale").nextSibling?.textContent).toBe("38 kg");
    expect(within(result()).getByText("Nombre d'essais").nextSibling?.textContent).toBe("3 essais");
  });

  it("un seul essai réussi, puis un seul échec : résultat incomplet avec la raison", async () => {
    render(<Harness keyName="traction" />);
    fireEvent.click(await screen.findByRole("button", { name: "Réussi" }));
    await within(result()).findByText("Le test va jusqu'au premier échec, ou jusqu'à une réussite au réglage le plus bas");
    expect(within(result()).getByRole("heading").textContent).toBe("Résultat incomplet");
    expect(within(result()).getByText("Nombre d'essais").nextSibling?.textContent).toBe("1 essai");

    fireEvent.click(screen.getByRole("button", { name: "Retirer l'essai 1" }));
    await waitFor(() => expect(draft()?.trials).toBeUndefined());
    fireEvent.click(screen.getByRole("button", { name: "Échec" }));
    await within(result()).findByText("Aucun essai réussi : recalibrer le premier essai");
  });
});

describe("traction : réglage le plus bas de la machine", () => {
  it("un essai réussi au réglage le plus bas termine le test, sans échec", async () => {
    render(<Harness keyName="traction" />);
    const field = await screen.findByRole("textbox", { name: /assistance \(kg\)/ });
    fireEvent.change(field, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Réglage le plus bas de la machine" }));
    fireEvent.click(screen.getByRole("button", { name: "Réussi" }));

    await screen.findByText("Réussi au réglage le plus bas de la machine : le test est fini.");
    expect(draft()?.trials).toMatchObject([{ value: 5, outcome: "success", atLowestSetting: true }]);
    expect(within(result()).getByRole("heading").textContent).toBe("Résultat");
    expect(within(result()).getByText("Assistance minimale").nextSibling?.textContent).toBe("5 kg");
    expect(screen.queryByRole("button", { name: "Réussi" })).toBeNull();
  });
});

describe("cardio : relevés minute par minute (D28, N9)", () => {
  it("un relevé manque : FC incomplète ; les cinq : moyenne à l'unité", async () => {
    render(<Harness keyName="cardio" />);
    await screen.findByLabelText("FC à 16 min");
    for (const [minute, bpm] of [[16, "128"], [17, "131"], [19, "134"], [20, "136"]] as const) type(`FC à ${minute} min`, bpm);

    await within(result()).findByText("FC incomplète : les 5 relevés de la 16e à la 20e minute sont nécessaires");
    type("FC à 18 min", "133");
    await waitFor(() => expect(within(result()).getByText("FC moyenne 16-20 min").nextSibling?.textContent).toBe("132 bpm"));
    expect(within(result()).getByRole("heading").textContent).toBe("Résultat");
    expect(draft()?.values).toEqual({ fc_16: 128, fc_17: 131, fc_18: 133, fc_19: 134, fc_20: 136 });
  });
});

describe("jambes : unité des sprints fixée au premier test (D17)", () => {
  it("sprints bloqués tant que l'unité n'est pas choisie ; Watts la fixe sur la version, sans nouvelle version", async () => {
    render(<Harness keyName="jambes" />);
    const sprint = (await screen.findByLabelText("Sprint 1")) as HTMLInputElement;
    expect(sprint.disabled).toBe(true);
    expect((screen.getByLabelText("Chaise contre le mur") as HTMLInputElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Watts" }));

    await waitFor(() => expect((screen.getByLabelText("Sprint 1") as HTMLInputElement).disabled).toBe(false));
    expect((await db.testProtocolVersions.get("protocol-jambes-v1"))?.settings?.unit).toBe("watts");
    expect(await db.testProtocolVersions.count()).toBe(7);
    expect(screen.queryByRole("group", { name: "Unité des sprints" })).toBeNull();
  });
});

describe("souplesse : doigts-sol signé, Apley par côté", () => {
  it("-4 cm accepté ; Apley : les deux côtés, le moins bon compte", async () => {
    render(<Harness keyName="souplesse" />);
    await screen.findByLabelText("Doigts-sol");
    type("Doigts-sol", "-4");
    type("Papillon", "18");
    type("Mains dans le dos gauche", "6");
    await within(result()).findByText("Mains dans le dos : les deux côtés sont nécessaires");
    type("Mains dans le dos droite", "11");

    await waitFor(() => expect(within(result()).getByRole("heading").textContent).toBe("Résultat"));
    expect(draft()).toEqual({ values: { doigts_sol_cm: -4, papillon_cm: 18 }, sideValues: { apley_cm: { left: 6, right: 11 } } });
    expect(within(result()).getByText("Doigts-sol").nextSibling?.textContent).toBe("-4 cm");
  });

  it("une valeur négative est refusée pour une mesure non signée", async () => {
    render(<Harness keyName="souplesse" />);
    await screen.findByLabelText("Papillon");
    expect(() => act(() => type("Papillon", "-2"))).toThrow(/négative/);
  });
});

describe("gestes", () => {
  it("Terminer le test : seulement une fois quelque chose saisi", async () => {
    render(<Harness keyName="tronc" />);
    const finish = (await screen.findByRole("button", { name: "Terminer le test" })) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    type("Planche", "75");
    await waitFor(() => expect(finish.disabled).toBe(false));
    fireEvent.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("lecture seule : aucun champ modifiable, aucun geste", async () => {
    render(<Harness keyName="tronc" editable={false} />);
    expect(((await screen.findByLabelText("Planche")) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Terminer le test" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sauter le test" })).toBeNull();
  });
});
