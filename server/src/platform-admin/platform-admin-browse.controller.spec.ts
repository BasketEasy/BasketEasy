import type { Request } from 'express';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { PlatformAdminBrowseController } from './platform-admin-browse.controller';
import type { PlatformAdminBrowseService } from './platform-admin-browse.service';
import type { PlatformAdminSearchService } from './platform-admin-search.service';
import type { PlatformAdminStatsService } from './platform-admin-stats.service';

describe('PlatformAdminBrowseController', () => {
  const page = { items: [], total: 0, page: 1, pageSize: 25 };
  const browse = {
    listUsers: jest.fn().mockResolvedValue(page),
    listPlayers: jest.fn().mockResolvedValue(page),
    recordListed: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new PlatformAdminBrowseController(
    browse as unknown as PlatformAdminBrowseService,
    {} as PlatformAdminSearchService,
    {} as PlatformAdminStatsService,
  );
  const user = { id: 'staff-1', email: 'staff@kluvo.net' } as RequestUser;
  const request = {} as Request;

  beforeEach(() => browse.recordListed.mockClear());

  // What each call passes as the `always` option (the 6th argument).
  const alwaysOf = () => browse.recordListed.mock.calls[0][5];

  describe.each([
    ['users', (q?: string) => controller.listUsers(user, 'SUPPORT', { q }, request)],
    ['players', (q?: string) => controller.listPlayers(user, 'SUPPORT', { q }, request)],
  ])('%s list', (_view, call) => {
    it('records a SUPPORT exact-address lookup, the answer alone confirming an account', async () => {
      await call('sam@example.org');
      expect(alwaysOf()).toEqual({ always: true });
    });

    it('leaves a plain SUPPORT page unrecorded', async () => {
      await call(undefined);
      expect(alwaysOf()).toEqual({ always: false });
    });
  });
});
