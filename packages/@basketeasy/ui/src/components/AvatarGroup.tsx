import { Avatar, AvatarFallback } from './Avatar';
import { cn } from '../lib/cn';

/**
 * A handful of people shown as overlapped initials, with a `+N` chip for the
 * rest — « Qui vient ? » on an event, the convoked squad on an agenda card.
 *
 * It composes `Avatar`/`AvatarFallback` rather than drawing its own circles,
 * so the fallback tone, the size steps and the ring stay one definition. The
 * only thing this adds is the overlap (a negative margin plus a 2px ring in
 * the surface colour, which is what makes the stack read as depth rather
 * than as touching discs) and the overflow arithmetic.
 *
 * The whole row is one `role="img"`: a screen-reader user gets one sentence
 * naming the people shown and how many more there are, instead of N unlabelled
 * graphics. Callers pair it with a link to the full list — the group is a
 * glance, never the only way to reach the roster.
 */
export interface AvatarGroupPerson {
  firstName: string;
  lastName: string;
}

export interface AvatarGroupProps {
  people: ReadonlyArray<AvatarGroupPerson>;
  /** How many faces to draw before collapsing the rest into a `+N` chip. */
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Same rule as the app's own `getInitials`, restated here because the design
 * system has no dependency on `app/` — and this is the one component in the
 * package that takes people rather than a ready-made string.
 */
function initialsOf({ firstName, lastName }: AvatarGroupPerson): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || '?';
}

function fullNameOf({ firstName, lastName }: AvatarGroupPerson): string {
  return `${firstName} ${lastName}`.trim();
}

export function AvatarGroup({ people, max = 4, size = 'sm', className }: AvatarGroupProps) {
  const shown = people.slice(0, Math.max(max, 0));
  const overflow = people.length - shown.length;

  const spoken = [
    ...shown.map(fullNameOf),
    ...(overflow > 0 ? [overflow === 1 ? '1 autre' : `${overflow} autres`] : []),
  ].join(', ');

  return (
    <div
      role="img"
      aria-label={spoken || 'Personne'}
      className={cn('flex items-center', className)}
    >
      {shown.map((person, index) => (
        <Avatar
          key={`${person.lastName}-${person.firstName}-${index}`}
          size={size}
          className="-ml-1.5 ring-2 ring-surface first:ml-0"
        >
          <AvatarFallback>{initialsOf(person)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <Avatar size={size} className="-ml-1.5 ring-2 ring-surface first:ml-0">
          <AvatarFallback tone="muted">{`+${overflow}`}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
