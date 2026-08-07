import { SetMetadata } from '@nestjs/common';
import type { ClubRole } from '@prisma/client';

export const CLUB_ROLES_KEY = 'clubRoles';

export const ClubRoles = (...roles: ClubRole[]) => SetMetadata(CLUB_ROLES_KEY, roles);
