import { PLATFORM_ROLES_KEY } from '../auth/decorators/platform-roles.decorator';
import { PlatformAdminActionsController } from './platform-admin-actions.controller';

// PlatformAdminGuard reads this metadata; a route that loses its decorator
// silently opens to SUPPORT, and no service test would notice.
describe('PlatformAdminActionsController roles', () => {
  const rolesOf = (method: keyof PlatformAdminActionsController) =>
    Reflect.getMetadata(PLATFORM_ROLES_KEY, PlatformAdminActionsController.prototype[method]);

  it.each(['markVerified', 'transferOwnership', 'deleteClub'] as const)(
    'keeps %s DATA_OFFICER-only',
    (method) => {
      expect(rolesOf(method)).toEqual(['DATA_OFFICER']);
    },
  );

  it('leaves routine support actions open to both roles', () => {
    expect(rolesOf('resendVerification')).toBeUndefined();
    expect(rolesOf('revokeSessions')).toBeUndefined();
  });
});
