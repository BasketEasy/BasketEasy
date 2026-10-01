import type { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge } from '@basketeasy/ui/badge';
import { Text } from '@basketeasy/ui/text';
import { getInitials } from '../clubs/getInitials';

export type DutyBadgeTone = 'structure' | 'success' | 'muted' | 'brand';

/**
 * One person on the duty card: their avatar, name and a line under it, and a
 * soft badge for where the duty stands. `isMe` is the reader (or the child
 * they act for), whose avatar is the brand one.
 */
export function DutyPersonRow({
  firstName,
  lastName,
  name,
  isMe = false,
  description,
  note,
  badge,
}: {
  firstName: string;
  lastName: string;
  /** What the row calls them: « Emma M. », « Vous » or the child's first name. */
  name: string;
  isMe?: boolean;
  description: string;
  /** A second, quieter line: « Personne ne sera prévenu ». */
  note?: string;
  badge?: { label: string; tone: DutyBadgeTone };
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar size="md">
        <AvatarFallback tone={isMe ? 'brand' : 'structure'}>
          {getInitials(firstName, lastName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <Text as="span" variant="label">
          {name}
        </Text>
        <Text as="span" variant="meta">
          {description}
        </Text>
        {note && (
          <Text as="span" variant="meta" size="xs" tone="accent">
            {note}
          </Text>
        )}
      </div>
      {badge && (
        <Badge variant="soft" tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
      )}
    </div>
  );
}

/** The duty card's one-sentence states: « Aucune suggestion pour l'instant ». */
export function DutyNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label">{title}</Text>
      <Text variant="meta">{children}</Text>
    </div>
  );
}
