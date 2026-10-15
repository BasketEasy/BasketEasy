import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { JerseyDutyController, JerseyRotationController } from './jersey-duty.controller';
import { JerseyDutyService } from './jersey-duty.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ALLOW_GUARDIANS_KEY } from '../auth/decorators/allow-guardians.decorator';
import { CLUB_ROLES_KEY } from '../auth/decorators/club-roles.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

const user: RequestUser = { id: 'user-1', email: 'u@example.com' };

type Handler = (...args: never[]) => unknown;
const proto = JerseyDutyController.prototype as unknown as Record<string, Handler>;
const meta = (key: string, name: string) => Reflect.getMetadata(key, proto[name]);

// The route table: which guard opens each route, and whether a parent may use
// it. Player-side routes are open to guardians (for jersey duty only);
// manager routes never are.
const PLAYER_ROUTES: [string, RequestMethod, string][] = [
  ['getDetail', RequestMethod.GET, '/'],
  ['accept', RequestMethod.POST, 'accept'],
  ['decline', RequestMethod.POST, 'decline'],
  ['proposeSwap', RequestMethod.POST, 'swap'],
  ['cancelSwap', RequestMethod.DELETE, 'swap'],
  ['acceptSwap', RequestMethod.POST, 'swap/accept'],
  ['refuseSwap', RequestMethod.POST, 'swap/refuse'],
];
const MANAGER_ROUTES: [string, RequestMethod, string][] = [
  ['assign', RequestMethod.PUT, '/'],
  ['markDone', RequestMethod.POST, 'done'],
  ['unmarkDone', RequestMethod.DELETE, 'done'],
  ['voidTurn', RequestMethod.POST, 'void'],
  ['unvoidTurn', RequestMethod.DELETE, 'void'],
];

describe('JerseyDutyController routes', () => {
  it('sits under the team route behind the session guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, JerseyDutyController)).toBe(
      'clubs/:clubId/teams/:teamId/events/:eventId/jersey-duty',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, JerseyDutyController)).toEqual([JwtAuthGuard]);
  });

  it.each(PLAYER_ROUTES)('%s is a club-member route that parents may use', (name, method, path) => {
    expect(meta(METHOD_METADATA, name)).toBe(method);
    expect(meta(PATH_METADATA, name)).toBe(path);
    expect(meta(GUARDS_METADATA, name)).toEqual([ClubRolesGuard]);
    expect(meta(CLUB_ROLES_KEY, name)).toEqual(['ADMIN', 'MEMBER']);
    expect(meta(ALLOW_GUARDIANS_KEY, name)).toBe(true);
  });

  it.each(MANAGER_ROUTES)(
    '%s is a team-manager route that parents never get',
    (name, method, path) => {
      expect(meta(METHOD_METADATA, name)).toBe(method);
      expect(meta(PATH_METADATA, name)).toBe(path);
      expect(meta(GUARDS_METADATA, name)).toEqual([TeamManagerGuard]);
      expect(meta(ALLOW_GUARDIANS_KEY, name)).toBeUndefined();
    },
  );

  it('serves the rotation overview to the team audience, parents included', () => {
    expect(Reflect.getMetadata(PATH_METADATA, JerseyRotationController)).toBe(
      'clubs/:clubId/teams/:teamId/jersey-rotation',
    );
    const handler = JerseyRotationController.prototype.getOverview;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([ClubRolesGuard]);
    expect(Reflect.getMetadata(ALLOW_GUARDIANS_KEY, handler)).toBe(true);
  });
});

describe('JerseyDutyController delegation', () => {
  let service: Record<string, jest.Mock>;
  let controller: JerseyDutyController;

  beforeEach(() => {
    service = {
      getDetail: jest.fn().mockResolvedValue('detail'),
      accept: jest.fn().mockResolvedValue('detail'),
      decline: jest.fn().mockResolvedValue('detail'),
      proposeSwap: jest.fn().mockResolvedValue('detail'),
      cancelSwap: jest.fn().mockResolvedValue('detail'),
      acceptSwap: jest.fn().mockResolvedValue('detail'),
      refuseSwap: jest.fn().mockResolvedValue('detail'),
      assign: jest.fn().mockResolvedValue('detail'),
      setDone: jest.fn().mockResolvedValue('detail'),
      setVoided: jest.fn().mockResolvedValue('detail'),
      getOverview: jest.fn().mockResolvedValue('overview'),
    };
    controller = new JerseyDutyController(service as unknown as JerseyDutyService);
  });

  it('passes the caller and the persona, never a body-supplied « me »', async () => {
    await controller.accept('c', 't', 'e', { forPlayerId: 'p-child' }, user);
    await controller.decline('c', 't', 'e', {}, user);
    await controller.cancelSwap('c', 't', 'e', {}, user);
    await controller.acceptSwap('c', 't', 'e', {}, user);
    await controller.refuseSwap('c', 't', 'e', {}, user);

    expect(service.accept).toHaveBeenCalledWith('c', 't', 'e', {
      userId: 'user-1',
      forPlayerId: 'p-child',
    });
    expect(service.decline).toHaveBeenCalledWith('c', 't', 'e', {
      userId: 'user-1',
      forPlayerId: undefined,
    });
    expect(service.cancelSwap).toHaveBeenCalledTimes(1);
    expect(service.acceptSwap).toHaveBeenCalledTimes(1);
    expect(service.refuseSwap).toHaveBeenCalledTimes(1);
  });

  it('passes the swap target from the body', async () => {
    await controller.proposeSwap('c', 't', 'e', {}, { teamPlayerId: 'tp-2' }, user);

    expect(service.proposeSwap).toHaveBeenCalledWith(
      'c',
      't',
      'e',
      { userId: 'user-1', forPlayerId: undefined },
      'tp-2',
    );
  });

  it('reads the detail and the overview as the caller', async () => {
    await controller.getDetail('c', 't', 'e', { forPlayerId: 'p' }, user);
    expect(service.getDetail).toHaveBeenCalledWith('c', 't', 'e', 'user-1', 'p');

    const rotation = new JerseyRotationController(service as unknown as JerseyDutyService);
    await rotation.getOverview('c', 't', { season: 2026, forPlayerId: 'p' }, user);
    expect(service.getOverview).toHaveBeenCalledWith('c', 't', 'user-1', 2026, 'p');
  });

  it('maps the manager routes onto assign, done and void', async () => {
    await controller.assign('c', 't', 'e', { teamPlayerId: null }, user);
    await controller.markDone('c', 't', 'e', user);
    await controller.unmarkDone('c', 't', 'e', user);
    await controller.voidTurn('c', 't', 'e', user);
    await controller.unvoidTurn('c', 't', 'e', user);

    expect(service.assign).toHaveBeenCalledWith('c', 't', 'e', 'user-1', null);
    expect(service.setDone.mock.calls.map((call) => call[4])).toEqual([true, false]);
    expect(service.setVoided.mock.calls.map((call) => call[4])).toEqual([true, false]);
  });
});
