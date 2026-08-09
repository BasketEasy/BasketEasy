const displayFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Formats an ISO date string for display, e.g. "5 janv. 2026, 18:00". */
export function formatEventDate(isoDate: string): string {
  return displayFormatter.format(new Date(isoDate));
}

/** Converts an ISO date string to the value a `datetime-local` input expects. */
export function toDatetimeLocalValue(isoDate: string): string {
  const date = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
