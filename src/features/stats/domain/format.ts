/** Focus time for display: "0 min", "45 min", "2 h", "2 h 05 min". Rounds to the nearest minute. */
export const formatFocus = (seconds: number): string => {
  const totalMin = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
};

/** Away time is a side note, so it is shown in whole minutes, with "<1 min" for a glimpse. */
export const formatAway = (ms: number): string => {
  const min = Math.round(ms / 60_000);
  if (ms > 0 && min === 0) return '<1 min';
  return formatFocus(min * 60);
};

/** Share of a whole as a rounded percentage; 0 when the whole is 0. */
export const percentOf = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.round((part / whole) * 100);
