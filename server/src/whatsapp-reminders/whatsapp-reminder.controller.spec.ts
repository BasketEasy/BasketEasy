import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { WhatsAppReminderController } from './whatsapp-reminder.controller';
import type { WhatsAppReminderService } from './whatsapp-reminder.service';

describe('WhatsAppReminderController impersonation', () => {
  const listPendingCancellations = jest.fn().mockResolvedValue([]);
  const getEventShare = jest.fn().mockResolvedValue({});
  const controller = new WhatsAppReminderController({
    listPendingCancellations,
    getEventShare,
  } as unknown as WhatsAppReminderService);
  const user = { id: 'u1' } as RequestUser;
  const impersonated = {
    id: 'u1',
    impersonation: { sessionId: 's1', actorUserId: 'admin' },
  } as RequestUser;

  beforeEach(() => jest.clearAllMocks());

  it('serves pending cancellations to a normal session', async () => {
    await controller.pendingCancellations('c1', 't1', user);
    expect(listPendingCancellations).toHaveBeenCalledWith('c1', 't1', 'u1');
  });

  it('refuses pending cancellations to a read-only impersonation', () => {
    expect(() => controller.pendingCancellations('c1', 't1', impersonated)).toThrow(
      ForbiddenException,
    );
    expect(listPendingCancellations).not.toHaveBeenCalled();
  });

  it('serves the event share to a normal session', async () => {
    await controller.getShare('c1', 't1', 'e1', user);
    expect(getEventShare).toHaveBeenCalledWith('c1', 't1', 'e1', 'u1');
  });

  it('refuses the event share to a read-only impersonation', () => {
    expect(() => controller.getShare('c1', 't1', 'e1', impersonated)).toThrow(ForbiddenException);
    expect(getEventShare).not.toHaveBeenCalled();
  });
});
