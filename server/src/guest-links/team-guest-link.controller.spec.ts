import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { TeamGuestLinkController } from './team-guest-link.controller';
import type { GuestLinksService } from './guest-links.service';

describe('TeamGuestLinkController', () => {
  const get = jest.fn();
  const controller = new TeamGuestLinkController({ get } as unknown as GuestLinksService);

  beforeEach(() => get.mockReset());

  it('hands the link to a manager', async () => {
    get.mockResolvedValue({ url: 'https://x/r/t' });
    const user = { id: 'u1' } as RequestUser;
    await expect(controller.get('c1', 't1', user)).resolves.toEqual({ url: 'https://x/r/t' });
  });

  it('refuses a read-only impersonation, the URL being a write credential', () => {
    const user = {
      id: 'u1',
      impersonation: { sessionId: 's1', actorUserId: 'admin' },
    } as RequestUser;
    expect(() => controller.get('c1', 't1', user)).toThrow(ForbiddenException);
    expect(get).not.toHaveBeenCalled();
  });
});
