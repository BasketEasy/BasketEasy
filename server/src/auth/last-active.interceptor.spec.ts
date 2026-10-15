import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LAST_ACTIVE_WRITE_INTERVAL_MS, LastActiveInterceptor } from './last-active.interceptor';
import type { PrismaService } from '../prisma/prisma.service';

describe('LastActiveInterceptor', () => {
  let prisma: { user: { update: jest.Mock } };
  let interceptor: LastActiveInterceptor;
  let next: CallHandler;

  function contextFor(userId?: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => (userId ? { user: { id: userId } } : {}) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T10:00:00.000Z'));
    prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    interceptor = new LastActiveInterceptor(prisma as unknown as PrismaService);
    next = { handle: () => of('response') };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes lastActiveAt on an authenticated request', () => {
    interceptor.intercept(contextFor('user-1'), next);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastActiveAt: new Date('2026-09-06T10:00:00.000Z') },
    });
  });

  it('does nothing on an impersonated request: staff viewing is not the subject being active', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1', impersonation: { sessionId: 's-1', actorUserId: 'admin-1' } },
        }),
      }),
    } as unknown as ExecutionContext;

    interceptor.intercept(context, next);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does nothing on an unauthenticated request', () => {
    interceptor.intercept(contextFor(), next);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('writes once per user inside the debounce window', () => {
    interceptor.intercept(contextFor('user-1'), next);
    jest.advanceTimersByTime(LAST_ACTIVE_WRITE_INTERVAL_MS - 1);
    interceptor.intercept(contextFor('user-1'), next);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('writes again once the window has passed', () => {
    interceptor.intercept(contextFor('user-1'), next);
    jest.advanceTimersByTime(LAST_ACTIVE_WRITE_INTERVAL_MS);
    interceptor.intercept(contextFor('user-1'), next);

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('debounces per user, not globally', () => {
    interceptor.intercept(contextFor('user-1'), next);
    interceptor.intercept(contextFor('user-2'), next);

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('passes the response through untouched', (done) => {
    interceptor.intercept(contextFor('user-1'), next).subscribe((value) => {
      expect(value).toBe('response');
      done();
    });
  });

  it('lets the next request retry after a failed write', async () => {
    prisma.user.update.mockRejectedValueOnce(new Error('db down'));

    interceptor.intercept(contextFor('user-1'), next);
    await Promise.resolve();
    interceptor.intercept(contextFor('user-1'), next);

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });
});
