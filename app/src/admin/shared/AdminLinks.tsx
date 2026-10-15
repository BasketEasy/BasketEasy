import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type {
  AdminClubRef,
  AdminPersonRef,
  AdminTeamRef,
} from '@basketeasy/types/platform-admin-browse';
import { teamLabel } from './adminFormat';
import { adminPaths } from './adminPaths';

export function AdminLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <TextLink asChild>
      <Link to={to}>{children}</Link>
    </TextLink>
  );
}

export function AdminClubLink({ club }: { club: AdminClubRef }) {
  return <AdminLink to={adminPaths.club(club.id)}>{club.name}</AdminLink>;
}

export function AdminTeamLink({ team }: { team: AdminTeamRef }) {
  return <AdminLink to={adminPaths.team(team.id)}>{teamLabel(team)}</AdminLink>;
}

/**
 * A person, as the server rendered them for this admin's role. A redacted
 * name carries a « masqué » badge so SUPPORT reads it as policy, not as
 * missing data. `withContact` adds the address (or its domain) underneath.
 */
export function AdminPersonLink({
  person,
  withContact = false,
}: {
  person: AdminPersonRef;
  withContact?: boolean;
}) {
  const to = person.kind === 'user' ? adminPaths.user(person.id) : adminPaths.player(person.id);
  const contact = person.email ?? (person.emailDomain ? `…@${person.emailDomain}` : null);

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-2">
        <AdminLink to={to}>{person.displayName}</AdminLink>
        {person.redacted && (
          <Badge variant="outline" tone="muted">
            masqué
          </Badge>
        )}
      </span>
      {withContact && contact && (
        <Text as="span" variant="meta" size="sm" className="break-all">
          {contact}
        </Text>
      )}
    </span>
  );
}
