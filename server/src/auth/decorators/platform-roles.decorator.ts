import { SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';

export const PLATFORM_ROLES_KEY = 'platformRoles';

/**
 * Narrows a back-office route to a subset of platform roles, on top of
 * PlatformAdminGuard's "holds a grant *and* a live step-up token" check —
 * the same relationship `@ClubRoles('ADMIN')` has with ClubRolesGuard.
 *
 * Without it a route is open to every grant holder, which is the correct
 * default for the read-only ones (a SUPPORT admin is meant to see the sweep's
 * run history and the redacted list). Every route that touches PII or erases
 * carries `@PlatformRoles('DATA_OFFICER')`.
 */
export const PlatformRoles = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
