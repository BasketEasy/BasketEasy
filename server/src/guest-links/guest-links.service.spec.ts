import { NotFoundException } from '@nestjs/common';
import { GuestLinksService } from './guest-links.service';

describe('GuestLinksService', () => {
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    teamGuestLink: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    event: { findUnique: jest.Mock };
    teamPlayer: { findUnique: jest.Mock };
    eventRsvpChange: { findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let service: GuestLinksService;

  beforeEach(() => {
    prisma = {
      clubTeam: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
      teamGuestLink: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      event: { findUnique: jest.fn() },
      teamPlayer: { findUnique: jest.fn() },
      eventRsvpChange: { findMany: jest.fn() },
    };
    audit = { record: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('https://kluvo.test/') };
    service = new GuestLinksService(prisma as never, audit as never, config as never);
  });

  it('refuses a team that is not the route club’s', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue(null);

    await expect(service.get('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    await expect(service.enable('club-1', 'team-1', 'u')).rejects.toThrow(NotFoundException);
  });

  it('is null while the link is off, an absolute URL once on', async () => {
    prisma.teamGuestLink.findUnique.mockResolvedValueOnce(null);
    await expect(service.get('club-1', 'team-1')).resolves.toBeNull();

    prisma.teamGuestLink.findUnique.mockResolvedValueOnce({ token: 'abc' });
    await expect(service.get('club-1', 'team-1')).resolves.toEqual({
      url: 'https://kluvo.test/r/abc',
    });
  });

  it('enable creates a 32-byte url-safe token and audits it', async () => {
    prisma.teamGuestLink.findUnique.mockResolvedValue(null);
    prisma.teamGuestLink.upsert.mockImplementation(({ create }) => Promise.resolve(create));

    const { url } = await service.enable('club-1', 'team-1', 'user-1');

    const token = url.split('/r/')[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(audit.record).toHaveBeenCalledWith({
      type: 'GUEST_LINK_ENABLED',
      userId: 'user-1',
      metadata: { teamId: 'team-1' },
    });
  });

  it('enable is idempotent: the live link comes back, nothing is audited', async () => {
    prisma.teamGuestLink.findUnique.mockResolvedValue({ token: 'live' });

    await expect(service.enable('club-1', 'team-1', 'user-1')).resolves.toEqual({
      url: 'https://kluvo.test/r/live',
    });
    expect(prisma.teamGuestLink.upsert).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('regenerate swaps the token and audits it', async () => {
    prisma.teamGuestLink.findUnique.mockResolvedValue({ token: 'old' });
    prisma.teamGuestLink.update.mockImplementation(({ data }) => Promise.resolve(data));

    const { url } = await service.regenerate('club-1', 'team-1', 'user-1');

    expect(url).not.toContain('/r/old');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GUEST_LINK_REGENERATED' }),
    );
  });

  it('regenerate on a link that is off is a 404', async () => {
    prisma.teamGuestLink.findUnique.mockResolvedValue(null);

    await expect(service.regenerate('club-1', 'team-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('disable deletes the row, so enabling again issues a new token', async () => {
    prisma.teamGuestLink.deleteMany.mockResolvedValue({ count: 1 });
    await service.disable('club-1', 'team-1', 'user-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GUEST_LINK_DISABLED' }),
    );

    prisma.teamGuestLink.findUnique.mockResolvedValue(null);
    prisma.teamGuestLink.upsert.mockImplementation(({ create }) => Promise.resolve(create));
    const { url } = await service.enable('club-1', 'team-1', 'user-1');
    expect(url.split('/r/')[1]).not.toBe('old');
    expect(prisma.teamGuestLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it('disable of an already-off link audits nothing', async () => {
    prisma.teamGuestLink.deleteMany.mockResolvedValue({ count: 0 });

    await service.disable('club-1', 'team-1', 'user-1');

    expect(audit.record).not.toHaveBeenCalled();
  });

  describe('history', () => {
    it('is a 404 for an event or roster slot of another team', async () => {
      prisma.event.findUnique.mockResolvedValue({ teamId: 'team-2' });
      prisma.teamPlayer.findUnique.mockResolvedValue({ teamId: 'team-1' });

      await expect(service.history('club-1', 'team-1', 'e', 'tp', 'u')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.eventRsvpChange.findMany).not.toHaveBeenCalled();
    });

    it('maps rows newest first, both sources, with the author as first name + initial', async () => {
      prisma.event.findUnique.mockResolvedValue({ teamId: 'team-1' });
      prisma.teamPlayer.findUnique.mockResolvedValue({ teamId: 'team-1' });
      prisma.eventRsvpChange.findMany.mockResolvedValue([
        {
          status: 'GOING',
          travelMode: 'DIRECT',
          source: 'GUEST_LINK',
          respondedBy: null,
          createdAt: new Date('2026-10-03T12:32:00Z'),
        },
        {
          status: 'NOT_GOING',
          travelMode: null,
          source: 'APP',
          respondedBy: { id: 'u-2', firstName: 'Sophie', lastName: 'Martin' },
          createdAt: new Date('2026-10-02T18:10:00Z'),
        },
      ]);

      const result = await service.history('club-1', 'team-1', 'e', 'tp', 'u-1');

      expect(prisma.eventRsvpChange.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 50 }),
      );
      expect(result).toEqual([
        {
          status: 'GOING',
          travelMode: 'DIRECT',
          source: 'GUEST_LINK',
          respondedBy: null,
          createdAt: '2026-10-03T12:32:00.000Z',
        },
        {
          status: 'NOT_GOING',
          travelMode: null,
          source: 'APP',
          respondedBy: { firstName: 'Sophie', lastInitial: 'M', isMe: false },
          createdAt: '2026-10-02T18:10:00.000Z',
        },
      ]);
    });
  });
});
