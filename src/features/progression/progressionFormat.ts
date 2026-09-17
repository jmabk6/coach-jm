/** `45 min`, `1 h`, `10 h 12` : durée totale d'activité, agrégat neutre. */
export function formatDurationTotal(sec: number): string {
  const minutes = Math.round(sec / 60);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
