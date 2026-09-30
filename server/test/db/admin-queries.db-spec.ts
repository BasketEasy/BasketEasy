import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { PlatformAdminService } from '../../src/platform-admin/platform-admin.service';
import { PlatformAdminStatsService } from '../../src/platform-admin/platform-admin-stats.service';
import type { AuditService } from '../../src/audit/audit.service';
import type { RetentionService } from '../../src/retention/retention.service';
import type { Request } from 'express';
import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';

const request = { headers: {}, socket: { remoteAddress: '203.0.113.7' } } as unknown as Request;

describe('back-office queries against Postgres', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('finds audit rows by actor and by the JSON-path subject', async () => {
    const service = new PlatformAdminService(
      asService(prisma),
      {} as JwtService,
      {} as ConfigService,
      { recordAndWait: jest.fn() } as unknown as AuditService,
      {} as RetentionService,
    );
    const list = (filter: Parameters<PlatformAdminService['listAuditLog']>[1]) =>
      service.listAuditLog({ id: 'dpo', email: 'dpo@kluvo.net' }, filter, 1, 25, request);
    const [admin, subject] = await Promise.all([createUser(), createUser()]);
    await prisma.auditLog.createMany({
      data: [
        { type: 'LOGIN_SUCCESS', userId: subject.id },
        { type: 'ADMIN_PII_VIEWED', userId: admin.id, metadata: { subjectUserId: subject.id } },
        { type: 'ADMIN_PII_VIEWED', userId: admin.id, metadata: { subjectPlayerId: 'p-1' } },
        { type: 'ADMIN_SUPPORT_ACTION', userId: admin.id, metadata: { action: 'RETRY_OCR' } },
        // Shown on a list page: found through the disclosed-id arrays.
        {
          type: 'ADMIN_PII_LISTED',
          userId: admin.id,
          metadata: { view: 'users', disclosedUserIds: [subject.id], disclosedPlayerIds: ['p-1'] },
        },
      ],
    });

    expect((await list({ subjectUserId: subject.id })).total).toBe(3);
    expect((await list({ subjectPlayerId: 'p-1' })).total).toBe(2);
    expect((await list({ action: 'RETRY_OCR' })).total).toBe(1);
  });

  it('finds GUARDIAN_* rows by the child and by the removed parent', async () => {
    const service = new PlatformAdminService(
      asService(prisma),
      {} as JwtService,
      {} as ConfigService,
      { recordAndWait: jest.fn() } as unknown as AuditService,
      {} as RetentionService,
    );
    const list = (filter: Parameters<PlatformAdminService['listAuditLog']>[1]) =>
      service.listAuditLog({ id: 'dpo', email: 'dpo@kluvo.net' }, filter, 1, 25, request);
    const [clubAdmin, parent] = await Promise.all([createUser(), createUser()]);
    await prisma.auditLog.createMany({
      data: [
        {
          type: 'GUARDIAN_INVITE_CREATED',
          userId: clubAdmin.id,
          metadata: { playerId: 'child-1', inviteId: 'i-1' },
        },
        {
          type: 'GUARDIAN_LINK_REMOVED',
          userId: clubAdmin.id,
          metadata: { playerId: 'child-1', guardianUserId: parent.id, removedBy: 'CLUB_ADMIN' },
        },
        {
          type: 'GUARDIAN_INVITE_CREATED',
          userId: clubAdmin.id,
          metadata: { playerId: 'child-2', inviteId: 'i-2' },
        },
      ],
    });

    expect((await list({ subjectPlayerId: 'child-1' })).total).toBe(2);
    const forParent = await list({ subjectUserId: parent.id });
    expect(forParent.items.map((entry) => entry.type)).toEqual(['GUARDIAN_LINK_REMOVED']);
  });

  it('counts matches with a meeting point at any level in one SQL statement', async () => {
    const stats = new PlatformAdminStatsService(asService(prisma));
    const withClubDefault = await createClub();
    await prisma.club.update({
      where: { id: withClubDefault.id },
      data: { meetingPointName: 'Parking', meetingPointAddress: '1 rue du Club' },
    });
    const bare = await createClub();
    const inherits = await createTeam(withClubDefault.id);
    const nothing = await createTeam(bare.id);
    const overridden = await createTeam(bare.id);
    const soon = new Date(Date.now() - 60 * 60 * 1000);
    const match = (teamId: string) =>
      prisma.event.create({ data: { teamId, type: 'MATCH', startsAt: soon, location: 'Salle' } });
    await match(inherits.id);
    await match(nothing.id);
    const own = await match(overridden.id);
    await prisma.eventMeeting.create({
      data: { eventId: own.id, meetingPointName: 'Gare', meetingPointAddress: 'Place de la gare' },
    });
    // A name without an address is not a meeting point.
    const half = await createTeam(bare.id);
    await prisma.team.update({
      where: { id: half.id },
      data: { meetingPointName: 'Quelque part' },
    });
    await match(half.id);

    const result = await stats.getStats('7d', undefined);

    expect(result.engagement.matchesWithMeetingPointShare).toBeCloseTo(2 / 4);
    const scoped = await stats.getStats('7d', withClubDefault.id);
    expect(scoped.engagement.matchesWithMeetingPointShare).toBe(1);
  });
});
