import type { ProfileSettings } from "../models";

/**
 * Profil (lot L.1, D24) : l'âge se calcule au jour près depuis la date de
 * naissance complète, jamais stocké ; la taille s'affiche en mètres.
 */

/** Âge révolu à `today` (YYYY-MM-DD) ; `undefined` sans date de naissance ou si elle est dans le futur. */
export function ageOn(birthDate: string | undefined, today: string): number | undefined {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > today) return undefined;
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/** « 1,77 m ». */
export function formatHeight(heightCm: number): string {
  return `${(heightCm / 100).toFixed(2).replace(".", ",")} m`;
}

/** « 58 ans | 1,77 m », ce qui est connu seulement. */
export function profileSummary(profile: ProfileSettings | undefined, today: string): string {
  const age = ageOn(profile?.birthDate, today);
  return [age !== undefined ? `${age} an${age > 1 ? "s" : ""}` : undefined, profile?.heightCm ? formatHeight(profile.heightCm) : undefined]
    .filter(Boolean)
    .join(" | ");
}

export function isProfileEmpty(profile: ProfileSettings | undefined): boolean {
  return !profile || (!profile.firstName?.trim() && !profile.birthDate && !profile.heightCm);
}

export interface ProfileInput {
  firstName: string;
  birthDate: string;
  height: string;
}

/** Saisie du profil : prénom libre, date de naissance facultative, taille 100–250 cm. */
export function parseProfileInput(input: ProfileInput, today: string): { ok: true; profile: ProfileSettings } | { ok: false; message: string } {
  const profile: ProfileSettings = {};
  const firstName = input.firstName.trim();
  if (firstName) profile.firstName = firstName;

  if (input.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return { ok: false, message: "Date de naissance invalide" };
    if (input.birthDate > today) return { ok: false, message: "La date de naissance ne peut pas être dans le futur" };
    profile.birthDate = input.birthDate;
  }

  const height = input.height.trim().replace(",", ".");
  if (height) {
    let value = Number(height);
    /* « 1,77 » en mètres ou « 177 » en centimètres. */
    if (Number.isFinite(value) && value < 3) value = value * 100;
    if (!Number.isFinite(value) || value < 100 || value > 250) return { ok: false, message: "Taille entre 100 et 250 cm" };
    profile.heightCm = Math.round(value);
  }

  return { ok: true, profile };
}
