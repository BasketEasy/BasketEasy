import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { cn } from '@basketeasy/ui/cn';
import { QueryError } from '@basketeasy/ui/query-error';
import { meterWidthClass } from './meterWidthClass';
import { Text } from '@basketeasy/ui/text';
import type { StatusTone } from './statusTone';

export interface EventRosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  /** Already resolved to a display label by the caller (e.g. via `teamMemberRoleLabel`) — this shell doesn't know about team roles. */
  role: string;
  statusLabel: string;
  statusTone: StatusTone;
  filled: boolean;
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function RosterRow({ entry }: { entry: EventRosterEntry }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border p-3 first:border-t-0">
      <Avatar size="md">
        <AvatarFallback>{initialsOf(entry.firstName, entry.lastName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <Text as="span" variant="label" size="sm" className="font-medium">
          {entry.firstName} {entry.lastName}
        </Text>
        <Text as="span" variant="meta" size="xs">
          {entry.role}
        </Text>
      </div>
      <Text
        as="span"
        variant="label"
        size="sm"
        tone={entry.statusTone}
        className="ml-auto flex items-center gap-1.5 whitespace-nowrap"
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            entry.filled ? 'bg-current' : 'border border-current',
          )}
        />
        {entry.statusLabel}
      </Text>
    </div>
  );
}

const METER_TONE_CLASS = { success: 'bg-success', brand: 'bg-orange' } as const;

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
  meterTone = 'success',
  isOpen,
  onToggle,
  isError = false,
  onRetry,
}: {
  entries: EventRosterEntry[];
  openLabel: string;
  closedLabel: string;
  summary?: string;
  meterValue?: number;
  meterMax?: number;
  /** The fill's meaning: `success` for a positive count, `brand` for the call-up. */
  meterTone?: 'success' | 'brand';
  isOpen: boolean;
  onToggle: () => void;
  isError?: boolean;
  onRetry?: () => void;
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
                METER_TONE_CLASS[meterTone],
              )}
            />
          </div>
          <Text as="span" variant="label" size="xs" tone="secondary" className="tabular">
            {summary}
          </Text>
        </div>
      )}
      {isOpen && isError && (
        <div className="w-full max-w-md">
          <QueryError onRetry={onRetry} />
        </div>
      )}
      {isOpen && !isError && entries.length > 0 && (
        <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-surface-2 shadow-sm">
          {entries.map((entry) => (
            <RosterRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
