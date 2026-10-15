import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { GuestLinkGuard } from './guest-link.guard';

const contextFor = (request: object) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('GuestLinkGuard', () => {
  const findUnique = jest.fn();
  const guard = new GuestLinkGuard({ teamGuestLink: { findUnique } } as never);

  beforeEach(() => findUnique.mockReset());

  it('puts the team on the request for a live token', async () => {
    findUnique.mockResolvedValue({ teamId: 'team-1' });
    const request: Record<string, unknown> = { params: { token: 'tok' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.guestLink).toEqual({ teamId: 'team-1', token: 'tok' });
  });

  it('answers a plain 404 for an unknown, regenerated or disabled token', async () => {
    findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor({ params: { token: 'gone' } }))).rejects.toThrow(
      NotFoundException,
    );
  });
});
