import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { FfbbImportService } from './ffbb-import.service';
import { FfbbMatch, FfbbProvider } from './ffbb-provider';
import type { MeetingPointsService } from '../meeting-points/meeting-points.service';

function match(overrides: Partial<FfbbMatch> = {}): FfbbMatch {
  return {
    id: 'match-1',
    startsAt: '2026-09-20T18:30:00',
    timeConfirmed: true,
    opponentLabel: 'Nantes Sully Basket',
    isHome: true,
    location: null,
    played: false,
    ...overrides,
  };
}

describe('FfbbImportService', () => {
  let service: FfbbImportService;
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    teamFfbbLink: { findMany: jest.Mock };
    event: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    eventMeeting: { updateMany: jest.Mock };
  };
  let ffbbProvider: { getMatchesForEngagement: jest.Mock; parseEngagementRef: jest.Mock };
  let meetingPoints: { announceMeetingChanges: jest.Mock };
  let whatsAppReminders: { syncEvents: jest.Mock; onEventsChanged: jest.Mock };

  beforeEach(() => {
    prisma = {
      clubTeam: { findUnique: jest.fn() },
      teamFfbbLink: { findMany: jest.fn() },
      event: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'event-new' }),
        update: jest.fn(),
      },
      eventMeeting: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    ffbbProvider = { getMatchesForEngagement: jest.fn(), parseEngagementRef: jest.fn() };
    meetingPoints = { announceMeetingChanges: jest.fn().mockResolvedValue(undefined) };
    whatsAppReminders = {
      syncEvents: jest.fn().mockResolvedValue(undefined),
      onEventsChanged: jest.fn().mockResolvedValue(undefined),
    };
    service = new FfbbImportService(
      prisma as never,
      ffbbProvider as unknown as FfbbProvider,
      meetingPoints as unknown as MeetingPointsService,
      whatsAppReminders as never,
    );
    prisma.clubTeam.findUnique.mockResolvedValue({
      clubId: 'club-1',
      teamId: 'team-1',
      isOwner: true,
    });
  });

  it('throws NotFoundException when the team is not linked to the club', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue(null);

    await expect(service.importSchedule('club-1', 'team-1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the team has no FFBB links', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([]);

    await expect(service.importSchedule('club-1', 'team-1')).rejects.toThrow(BadRequestException);
  });

  it('creates a new event for a new match', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match()],
    });
    prisma.event.findUnique.mockResolvedValue(null);

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.create).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-09-20T16:30:00Z'),
        location: 'Lieu non communiqué',
        opponentName: 'Nantes Sully Basket',
        externalId: 'match-1',
        timeConfirmed: true,
        venue: 'HOME',
      },
    });
    expect(result).toEqual({ created: 1, updated: 0, unchanged: 0 });
  });

  it('reconciles the WhatsApp reminders for a created match and an updated one, not an unchanged one', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      { id: 'link-1', teamId: 'team-1', ffbbEngagementRef: 'r', ffbbEngagementLabel: 'C' },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [
        match({ id: 'new' }),
        match({ id: 'moved', startsAt: '2026-09-27T18:30:00' }),
        match({ id: 'same' }),
      ],
    });
    const stored = (id: string, startsAt: string) => ({
      id,
      startsAt: new Date(startsAt),
      location: 'Lieu non communiqué',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
      venue: 'HOME',
    });
    prisma.event.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored('event-moved', '2026-09-20T16:30:00Z'))
      .mockResolvedValueOnce(stored('event-same', '2026-09-20T16:30:00Z'));

    await service.importSchedule('club-1', 'team-1');

    expect(whatsAppReminders.syncEvents).toHaveBeenCalledTimes(1);
    expect(whatsAppReminders.syncEvents).toHaveBeenCalledWith(['event-new', 'event-moved']);
    // Only a match FFBB changed can have made a shared message stale, not a new one.
    expect(whatsAppReminders.onEventsChanged).toHaveBeenCalledWith(['event-moved']);
  });

  it('asks the provider to resolve venues and writes the address to the event', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [
        match({ location: 'Salle de la Herdrie, 12 rue des Sports, 44115 Basse-Goulaine' }),
      ],
    });
    prisma.event.findUnique.mockResolvedValue(null);

    await service.importSchedule('club-1', 'team-1');

    expect(ffbbProvider.getMatchesForEngagement).toHaveBeenCalledWith('ref-1', {
      resolveVenues: true,
    });
    expect(prisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        location: 'Salle de la Herdrie, 12 rue des Sports, 44115 Basse-Goulaine',
      }),
    });
  });

  it('fills in the venue on a re-sync of an event imported before FFBB published one', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ location: 'Gymnase du Loquidy, Nantes' })],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      startsAt: new Date('2026-09-20T16:30:00Z'),
      location: 'Lieu non communiqué',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
      venue: 'HOME',
    });

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({ location: 'Gymnase du Loquidy, Nantes' }),
    });
    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0 });
  });

  it('keeps an already-imported address when a re-sync resolves no venue', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ location: null })],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      startsAt: new Date('2026-09-20T16:30:00Z'),
      location: 'Salle de la Herdrie, 12 rue des Sports, 44115 Basse-Goulaine',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
      venue: 'HOME',
    });

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, unchanged: 1 });
  });

  it('clamps an over-long address to what the event DTO will accept back', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ location: `Salle ${'très longue '.repeat(20)}Nantes` })],
    });
    prisma.event.findUnique.mockResolvedValue(null);

    await service.importSchedule('club-1', 'team-1');

    const { location } = prisma.event.create.mock.calls[0][0].data;
    expect(location.length).toBeLessThanOrEqual(120);
    expect(location.endsWith('…')).toBe(true);
  });

  it('updates an existing unplayed event when fields changed, and RSVPs/convocations survive (same id, no delete)', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ startsAt: '2026-09-21T19:00:00' })],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      startsAt: new Date('2026-09-20T16:30:00Z'),
      location: 'Lieu non communiqué',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
      venue: 'HOME',
    });

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        startsAt: new Date('2026-09-21T17:00:00Z'),
        location: 'Lieu non communiqué',
        opponentName: 'Nantes Sully Basket',
        timeConfirmed: true,
        venue: 'HOME',
      },
    });
    // The kick-off moved, so a meeting-time override set against the old one
    // is dropped, and the new meeting time is announced.
    expect(prisma.eventMeeting.updateMany).toHaveBeenCalledWith({
      where: { eventId: { in: ['event-1'] } },
      data: { meetsAtOverride: null },
    });
    expect(meetingPoints.announceMeetingChanges).toHaveBeenCalledWith(['event-1']);
    expect(prisma.event.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0 });
  });

  it('leaves an existing event unchanged when nothing actually differs', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match()],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      startsAt: new Date('2026-09-20T16:30:00Z'),
      location: 'Lieu non communiqué',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
      venue: 'HOME',
    });

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, unchanged: 1 });
  });

  it('never re-touches an already-played match even if fields differ', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ played: true, startsAt: '2026-09-25T20:00:00' })],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      startsAt: new Date('2026-09-20T16:30:00Z'),
      location: 'Lieu non communiqué',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
    });

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, unchanged: 1 });
  });

  it('still creates a first-time import of an already-played match', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ played: true })],
    });
    prisma.event.findUnique.mockResolvedValue(null);

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.create).toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 0, unchanged: 0 });
  });

  it('propagates isImported-relevant timeConfirmed:false onto the created event', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ timeConfirmed: false, startsAt: '2026-09-27T00:00:00' })],
    });
    prisma.event.findUnique.mockResolvedValue(null);

    await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ timeConfirmed: false }) }),
    );
  });

  it('stores the away venue for an away match', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ isHome: false })],
    });
    prisma.event.findUnique.mockResolvedValue(null);

    await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ venue: 'AWAY' }) }),
    );
  });

  it('updates the venue when FFBB flips home/away for an already-imported match', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [match({ isHome: false })],
    });
    prisma.event.findUnique.mockResolvedValue({
      id: 'event-1',
      startsAt: new Date('2026-09-20T16:30:00Z'),
      location: 'Lieu non communiqué',
      opponentName: 'Nantes Sully Basket',
      timeConfirmed: true,
      venue: 'HOME',
    });

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ venue: 'AWAY' }) }),
    );
    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0 });
  });

  it('imports matches from two linked engagements with no id collision, into one combined result', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
      { id: 'link-2', teamId: 'team-1', ffbbEngagementRef: 'ref-2', ffbbEngagementLabel: 'Coupe' },
    ]);
    ffbbProvider.getMatchesForEngagement.mockImplementation((ref: string) =>
      Promise.resolve({
        competitionLabel: null,
        matches: [match({ id: `${ref}-match-1` })],
      }),
    );
    prisma.event.findUnique.mockResolvedValue(null);

    const result = await service.importSchedule('club-1', 'team-1');

    expect(prisma.event.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ created: 2, updated: 0, unchanged: 0 });
  });

  it('aborts the whole import and names the failing link when one engagement fetch fails', async () => {
    prisma.teamFfbbLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-1',
        ffbbEngagementLabel: 'Championnat',
      },
      {
        id: 'link-2',
        teamId: 'team-1',
        ffbbEngagementRef: 'ref-2',
        ffbbEngagementLabel: 'Coupe Loire-Atlantique',
      },
    ]);
    ffbbProvider.getMatchesForEngagement.mockImplementation((ref: string) =>
      ref === 'ref-1'
        ? Promise.resolve({ competitionLabel: null, matches: [match()] })
        : Promise.reject(new Error('boom')),
    );

    await expect(service.importSchedule('club-1', 'team-1')).rejects.toThrow(BadGatewayException);
    await expect(service.importSchedule('club-1', 'team-1')).rejects.toThrow(
      /Coupe Loire-Atlantique/,
    );
    expect(prisma.event.create).not.toHaveBeenCalled();
  });
});
