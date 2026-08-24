import { useState, type ReactNode } from 'react';
import { FieldError } from '@basketeasy/ui/field-error';
import type { EventRsvpStatus, TeamEvent } from '@basketeasy/types/events';
import { EVENT_RSVP_STATUS_OPTIONS } from './eventRsvpLabels';
import { useEventRsvpSet } from './useEventRsvpSet';
import { useEventRsvpClear } from './useEventRsvpClear';
import { getClubErrorMessage } from './clubErrorMessages';

const ACTIVE_CLASSES: Record<EventRsvpStatus, string> = {
  GOING: 'bg-success text-cream',
  MAYBE: 'bg-blue-green text-cream',
  NOT_GOING: 'bg-error text-cream',
};

const ICONS: Record<EventRsvpStatus, ReactNode> = {
  GOING: (
    <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  ),
  MAYBE: (
    <>
      <circle cx="12" cy="12" r="8.5" strokeWidth={1.6} />
      <path
        d="M9.6 9.6a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.1.9-1.1 1.8"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="0.35" fill="currentColor" stroke="none" />
    </>
  ),
  NOT_GOING: (
    <path
      d="M6.5 6.5l11 11M17.5 6.5l-11 11"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

/**
 * Inline tri-state RSVP toggle for a rostered team member — single-field,
 * non-destructive, high-frequency, so an inline control rather than a
 * Dialog per CLAUDE.md's "Modals vs. inline editing" guidance. Clicking the
 * already-active option clears the response back to "no response yet".
 */
export function EventRsvpControl({
  clubId,
  teamId,
  event,
  fullWidth,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  fullWidth?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { mutate: setRsvp, isPending: isSetting } = useEventRsvpSet(clubId, teamId);
  const { mutate: clearRsvp, isPending: isClearing } = useEventRsvpClear(clubId, teamId);
  const isPending = isSetting || isClearing;

  const select = (status: EventRsvpStatus) => {
    setError(null);
    if (event.myRsvpStatus === status) {
      clearRsvp({ eventId: event.id }, { onError: (err) => setError(getClubErrorMessage(err)) });
    } else {
      setRsvp(
        { eventId: event.id, status },
        { onError: (err) => setError(getClubErrorMessage(err)) },
      );
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`inline-flex overflow-hidden rounded-md border border-border bg-cream ${
          fullWidth ? 'w-full' : 'w-fit'
        }`}
      >
        {EVENT_RSVP_STATUS_OPTIONS.map((option, index) => {
          const active = event.myRsvpStatus === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={isPending}
              onClick={() => select(option.value)}
              className={`flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                fullWidth ? 'flex-1' : ''
              } ${index > 0 ? 'border-l border-border' : ''} ${
                active
                  ? ACTIVE_CLASSES[option.value]
                  : 'bg-transparent text-muted hover:bg-border/40'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="h-4 w-4 shrink-0"
              >
                {ICONS[option.value]}
              </svg>
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
