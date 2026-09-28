import type { PlatformRole } from '@prisma/client';
import type { AdminPersonRef } from '@basketeasy/types/platform-admin-browse';

/**
 * The one place a person becomes an `AdminPersonRef`. Every browse and search
 * response that mentions somebody goes through here, so the SUPPORT /
 * DATA_OFFICER rule is decided once, on the server: a SUPPORT caller never
 * receives a name or an e-mail local part it would then be trusted to hide.
 *
 * See docs/superpowers/specs/2026-09-28-backoffice-v2-part1-read-api.md §3.
 */

interface NamedRow {
  firstName: string | null;
  lastName: string | null;
}

export function userRef(
  role: PlatformRole,
  user: NamedRow & { id: string; email: string },
): AdminPersonRef {
  const full = role === 'DATA_OFFICER';
  return {
    kind: 'user',
    id: user.id,
    displayName: full ? (fullNameOf(user) ?? user.email) : initialsOf(user),
    email: full ? user.email : null,
    emailDomain: emailDomainOf(user.email),
    redacted: !full,
  };
}

export function playerRef(
  role: PlatformRole,
  player: NamedRow & { id: string; user?: { email: string } | null },
): AdminPersonRef {
  const full = role === 'DATA_OFFICER';
  const email = player.user?.email ?? null;
  return {
    kind: 'player',
    id: player.id,
    displayName: full ? (fullNameOf(player) ?? '—') : initialsOf(player),
    email: full ? email : null,
    emailDomain: email ? emailDomainOf(email) : null,
    redacted: !full,
  };
}

/** A free-text name (a consent attester) under the same rule. */
export function redactName(role: PlatformRole, name: string): string {
  if (role === 'DATA_OFFICER') return name;
  const [first, ...rest] = name.trim().split(/\s+/);
  return initialsOf({ firstName: first ?? null, lastName: rest.join(' ') || null });
}

/** "J. D.", "J." with one part known, "—" with none. */
export function initialsOf(row: NamedRow): string {
  const parts = [row.firstName, row.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .map((part) => `${Array.from(part)[0].toUpperCase()}.`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

/**
 * The domain alone, never the local part — enough to tell a real club
 * volunteer from an obvious test account without identifying anybody.
 */
export function emailDomainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
}

function fullNameOf(row: NamedRow): string | null {
  const name = [row.firstName, row.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name.length > 0 ? name : null;
}
