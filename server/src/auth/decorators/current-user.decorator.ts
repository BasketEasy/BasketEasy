import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  id: string;
  email: string;
  /**
   * Set only when a back-office DATA_OFFICER is viewing the product as this
   * user (ImpersonationStrategy). Everything downstream sees the subject as
   * the caller, which is the point; this is how the few places that must
   * behave differently (no activity ping, a masked vote, no back-office) tell.
   */
  impersonation?: { sessionId: string; actorUserId: string };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
