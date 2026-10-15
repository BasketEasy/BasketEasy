import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import {
  PlatformAdminImpersonationController,
  PlatformAdminImpersonationEndController,
} from './platform-admin-impersonation.controller';

describe('impersonation controllers', () => {
  it('starts behind the step-up guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformAdminImpersonationController)).toEqual([
      JwtAuthGuard,
      PlatformAdminGuard,
    ]);
  });

  // The step-up token is minted before the session and expires first:
  // « Quitter » must still work in that gap.
  it('ends behind the ordinary session only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformAdminImpersonationEndController)).toEqual([
      JwtAuthGuard,
    ]);
  });
});
