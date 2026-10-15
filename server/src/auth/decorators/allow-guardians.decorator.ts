import { SetMetadata } from '@nestjs/common';

export const ALLOW_GUARDIANS_KEY = 'allowGuardians';

/**
 * Lets `ClubRolesGuard` also admit a player's guardian on this route: a
 * parent who is nothing else in the club has no `ClubMembership`, so every
 * club-scoped route would otherwise 403 them. Only for the reads a rostered
 * member already has on their own team, plus the answer writes a parent may
 * make for a child (RSVP, travel mode, the child's jersey wash duty) — see
 * docs/decisions/guardians.md.
 * The guard only opens the door; the service still narrows to the persona
 * through `resolveActingTeamPlayer`.
 */
export const AllowGuardians = () => SetMetadata(ALLOW_GUARDIANS_KEY, true);
