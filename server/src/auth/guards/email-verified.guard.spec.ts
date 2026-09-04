import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EMAIL_NOT_VERIFIED_CODE } from '@basketeasy/types/account-security';
import { EmailVerifiedGuard } from './email-verified.guard';
import { PrismaService } from '../../prisma/prisma.service';

function contextFor(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    guard = new EmailVerifiedGuard(prisma as unknown as PrismaService);
  });

  it('allows a caller whose address is verified', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });

    await expect(guard.canActivate(contextFor({ user: { id: 'user-1' } }))).resolves.toBe(true);
  });

  it('rejects a caller whose address is not verified', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    await expect(guard.canActivate(contextFor({ user: { id: 'user-1' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('carries a machine-readable code so the client can offer the resend button', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    await expect(guard.canActivate(contextFor({ user: { id: 'user-1' } }))).rejects.toMatchObject({
      response: { code: EMAIL_NOT_VERIFIED_CODE },
    });
  });

  it('fails closed when JwtAuthGuard has not populated request.user', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor({ user: { id: 'gone' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
