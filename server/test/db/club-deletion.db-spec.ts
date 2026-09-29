import type { Request } from 'express';
import { PlatformAdminActionsService } from '../../src/platform-admin/platform-admin-actions.service';
import type { AccountSecurityService } from '../../src/auth/account-security.service';
import type { ScoresheetsService } from '../../src/scoresheets/scoresheets.service';
import type { StorageService } from '../../src/storage/storage.service';
import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';

const request = { headers: {}, socket: { remoteAddress: '203.0.113.7' } } as unknown as Request;

describe('club deletion against Postgres', () => {
  const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
  const service = new PlatformAdminActionsService(
    asService(prisma),
    {} as AccountSecurityService,
    {} as ScoresheetsService,
    storage as unknown as StorageService,
  );

  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('removes the club and everything that is its own, and leaves a partner’s team alone', async () => {
    const staff = await createUser('dpo@kluvo.net');
    const member = await createUser();
    const club = await createClub('BC Nantes');
    const partner = await createClub('ES Rezé');
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: member.id, role: 'MEMBER' },
    });

    const owned = await createTeam(club.id);
    // A team the club only partners on: it stays with its owner, minus this
    // club's players.
    const partnersTeam = await createTeam(partner.id, [club.id]);
    const player = await prisma.player.create({
      data: { clubId: club.id, firstName: 'Léo', lastName: 'Martin' },
    });
    const partnerPlayer = await prisma.player.create({
      data: { clubId: partner.id, firstName: 'Emma', lastName: 'Roux' },
    });
    const slot = await prisma.teamPlayer.create({
      data: { teamId: owned.id, playerId: player.id },
    });
    await prisma.teamPlayer.create({ data: { teamId: partnersTeam.id, playerId: player.id } });
    await prisma.teamPlayer.create({
      data: { teamId: partnersTeam.id, playerId: partnerPlayer.id },
    });
    const event = await prisma.event.create({
      data: { teamId: owned.id, type: 'MATCH', startsAt: new Date(), location: 'Gymnase' },
    });
    await prisma.eventScoresheet.create({
      data: { eventId: event.id, storageKey: 'sheets/a.jpg', uploadedByTeamPlayerId: slot.id },
    });

    await service.deleteClub(
      { id: staff.id, email: staff.email, role: 'DATA_OFFICER' },
      club.id,
      'Club dissous, ticket #42',
      request,
    );

    expect(await prisma.club.findUnique({ where: { id: club.id } })).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: owned.id } })).toBeNull();
    expect(await prisma.event.count({ where: { teamId: owned.id } })).toBe(0);
    expect(await prisma.player.count({ where: { clubId: club.id } })).toBe(0);
    expect(await prisma.clubMembership.count({ where: { clubId: club.id } })).toBe(0);
    // The partner's team survives, with only the partner's own player.
    const survivors = await prisma.teamPlayer.findMany({ where: { teamId: partnersTeam.id } });
    expect(survivors.map((row) => row.playerId)).toEqual([partnerPlayer.id]);
    expect(await prisma.clubTeam.count({ where: { teamId: partnersTeam.id } })).toBe(1);
    // The account outlives the club; the audit row says what was deleted.
    expect(await prisma.user.findUnique({ where: { id: member.id } })).not.toBeNull();
    const [row] = await prisma.auditLog.findMany({ where: { type: 'ADMIN_SUPPORT_ACTION' } });
    expect(row.metadata).toMatchObject({ action: 'CLUB_DELETED', clubId: club.id });
    expect(storage.deleteObject).toHaveBeenCalledWith('sheets/a.jpg');
  });
});
