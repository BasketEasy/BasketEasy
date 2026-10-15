import { removeClubMembership } from '../../src/clubs/club-writes';
import { createClub, createUser, prisma, resetDb } from './db';

describe('last club admin under concurrency (Postgres)', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('lets only one of two simultaneous removals of the last two admins through', async () => {
    const club = await createClub();
    const [a, b] = await Promise.all([createUser(), createUser()]);
    await prisma.clubMembership.createMany({
      data: [
        { clubId: club.id, userId: a.id, role: 'ADMIN' },
        { clubId: club.id, userId: b.id, role: 'ADMIN' },
      ],
    });

    const outcomes = await Promise.allSettled(
      [a.id, b.id].map((userId) =>
        prisma.$transaction((tx) => removeClubMembership(tx, club.id, userId)),
      ),
    );

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
    expect(await prisma.clubMembership.count({ where: { clubId: club.id, role: 'ADMIN' } })).toBe(
      1,
    );
  });
});
