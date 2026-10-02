import { PlatformAdminSearchService } from '../../src/platform-admin/platform-admin-search.service';
import { asService, createClub, createUser, prisma, resetDb } from './db';

describe('back-office search against Postgres', () => {
  const service = new PlatformAdminSearchService(asService(prisma));

  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('SUPPORT finds an account by its exact e-mail, in any case, and not by a fragment', async () => {
    const user = await createUser('Jean.Dupont@Example.org');
    await createUser('jean.dupont@example.com');

    const exact = await service.search('SUPPORT', 'jean.dupont@example.ORG');
    expect(exact.groups.user.map((hit) => hit.id)).toEqual([user.id]);

    const fragment = await service.search('SUPPORT', 'dupont');
    expect(fragment.groups.user).toEqual([]);
  });

  it('SUPPORT: LIKE wildcards in the query are literal, not a way to enumerate accounts', async () => {
    await createUser('axb@example.org');

    const underscore = await service.search('SUPPORT', 'a_b@example.org');
    expect(underscore.groups.user).toEqual([]);
    const percent = await service.search('SUPPORT', '%@example.org');
    expect(percent.groups.user).toEqual([]);
  });

  it('DATA_OFFICER substring search treats % and _ literally (escapeLike)', async () => {
    await createUser('axb@example.org');
    await createClub('Rezé 100% Basket');
    await createClub('Rezé Basket');

    const users = await service.search('DATA_OFFICER', 'a_b');
    expect(users.groups.user).toEqual([]);

    const clubs = await service.search('DATA_OFFICER', '100%');
    expect(clubs.groups.club.map((hit) => hit.label)).toEqual(['Rezé 100% Basket']);

    const wildcardOnly = await service.search('DATA_OFFICER', '%%');
    expect(wildcardOnly.groups.club).toEqual([]);
  });
});
