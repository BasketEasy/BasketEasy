import { createHash } from 'crypto';

// Shared by RefreshToken (auth.service.ts) and PlayerInvite (invites.service.ts,
// clubs.service.ts) — both store only a hash of a random token, never the raw
// value, so a leaked/logged database can't be used to impersonate a session or
// claim an invite.
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
