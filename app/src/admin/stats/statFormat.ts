import type { AdminRatio } from '@basketeasy/types/platform-admin-stats';

const NUMBER = new Intl.NumberFormat('fr-FR');
const DECIMAL = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const WEEK = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatCount(value: number): string {
  return NUMBER.format(value);
}

export function formatDecimal(value: number | null): string {
  return value === null ? '—' : DECIMAL.format(value);
}

/** A ratio with nothing to divide by reads « — », never « 0 % ». */
export function formatRatio(value: AdminRatio): string {
  return value === null ? '—' : `${Math.round(value * 100)} %`;
}

/** `weekStart` is a `YYYY-MM-DD` Monday; read as a calendar date, not an instant. */
export function formatWeek(weekStart: string): string {
  return WEEK.format(new Date(`${weekStart}T00:00:00Z`));
}
