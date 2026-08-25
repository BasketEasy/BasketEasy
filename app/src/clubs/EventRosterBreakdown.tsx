import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { cn } from '@basketeasy/ui/cn';

export interface EventRosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  /** Already resolved to a display label by the caller (e.g. via `teamMemberRoleLabel`) — this shell doesn't know about team roles. */
  role: string;
  statusLabel: string;
  statusClassName: string;
  filled: boolean;
}

/**
 * Rounds `value / max` to the nearest quarter and maps it to one of a fixed
 * set of Tailwind width classes. The classes must appear as complete literal
 * strings here (not built by interpolation) so Tailwind's scanner can see
 * them — an interpolated class would silently ship an unstyled meter.
 */
export function meterWidthClass(value: number, max: number): string {
  if (max <= 0) {
    return 'w-0';
  }
  const ratio = Math.min(1, Math.max(0, value / max));
  const quarter = Math.round(ratio * 4);
  switch (quarter) {
    case 0:
      return 'w-0';
    case 1:
      return 'w-1/4';
    case 2:
      return 'w-1/2';
    case 3:
      return 'w-3/4';
    default:
      return 'w-full';
  }
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function RosterRow({ entry }: { entry: EventRosterEntry }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border p-3 first:border-t-0">
      <Avatar className="h-8 w-8 text-xs">
        <AvatarFallback>{initialsOf(entry.firstName, entry.lastName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-charcoal">
          {entry.firstName} {entry.lastName}
        </span>
        <span className="text-xs text-muted">{entry.role}</span>
      </div>
      <span
        className={cn(
          'ml-auto flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold',
          entry.statusClassName,
        )}
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            entry.filled ? 'bg-current' : 'border border-current',
          )}
        />
        {entry.statusLabel}
      </span>
    </div>
  );
}

/**
 * Shared collapsible shell for roster-wide breakdowns (RSVP, convocations):
 * a toggle button, a progress meter + summary, and the per-row list once
 * opened. Callers own their own data fetching, status-to-label mapping, and
 * hooks — this component only renders what it's handed.
 */
export function EventRosterBreakdown({
  entries,
  openLabel,
  closedLabel,
  summary,
  meterValue,
  meterMax,
  meterClassName,
  isOpen,
  onToggle,
}: {
  entries: EventRosterEntry[];
  openLabel: string;
  closedLabel: string;
  summary?: string;
  meterValue?: number;
  meterMax?: number;
  meterClassName?: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5">
      <Button variant="outline" onClick={onToggle}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('mr-1.5 h-4 w-4 transition-transform', isOpen && 'rotate-180')}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        {isOpen ? openLabel : closedLabel}
      </Button>
      {summary && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sunk">
            <div
              className={cn(
                'h-full rounded-full',
                meterWidthClass(meterValue ?? 0, meterMax ?? 0),
                meterClassName,
              )}
            />
          </div>
          <span className="tabular text-xs font-semibold text-muted">{summary}</span>
        </div>
      )}
      {isOpen && entries.length > 0 && (
        <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-cream shadow-sm">
          {entries.map((entry) => (
            <RosterRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
