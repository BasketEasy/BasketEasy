import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';

/**
 * The caller's platform role, as attached by PlatformAdminGuard.
 *
 * Throws rather than defaulting when it is absent: a handler reading it
 * without the guard in front is a programming error, and silently treating
 * the caller as SUPPORT (or worse, DATA_OFFICER) would hide it.
 */
export const CurrentPlatformRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformRole => {
    const role: PlatformRole | undefined = ctx.switchToHttp().getRequest().platformRole;
    if (!role) {
      throw new Error('CurrentPlatformRole used on a route without PlatformAdminGuard');
    }
    return role;
  },
);
