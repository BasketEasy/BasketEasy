// app/src/api/client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { IMPERSONATION_READ_ONLY_CODE } from '@basketeasy/types/platform-admin-impersonation';
import {
  apiClient,
  ApiError,
  setAccessToken,
  setImpersonationToken,
  setPlatformToken,
  subscribeToImpersonationExpiry,
  subscribeToSessionExpiry,
} from './client';

describe('apiClient', () => {
  afterEach(() => {
    setAccessToken(null);
  });

  it('attaches the Authorization header when an access token is set', async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.get('/api/whoami', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    setAccessToken('token-123');
    await apiClient.get('/whoami');

    expect(receivedAuth).toBe('Bearer token-123');
  });

  it('does not attach an Authorization header when no token is set', async () => {
    let receivedAuth: string | null | undefined = undefined;
    server.use(
      http.get('/api/whoami', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient.get('/whoami');

    expect(receivedAuth).toBeNull();
  });

  it('post() sends a JSON body and returns the parsed response', async () => {
    let receivedBody: unknown;
    server.use(
      http.post('/api/echo', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ received: true });
      }),
    );

    const result = await apiClient.post<{ received: boolean }>('/echo', { foo: 'bar' });

    expect(receivedBody).toEqual({ foo: 'bar' });
    expect(result).toEqual({ received: true });
  });

  it('on a 401, refreshes once and retries the original request', async () => {
    let whoamiCallCount = 0;
    server.use(
      http.get('/api/whoami', () => {
        whoamiCallCount += 1;
        if (whoamiCallCount === 1) {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'new-token' })),
    );

    const result = await apiClient.get<{ ok: boolean }>('/whoami');

    expect(result).toEqual({ ok: true });
    expect(whoamiCallCount).toBe(2);
  });

  it('dedupes concurrent 401s into a single refresh call', async () => {
    let refreshCallCount = 0;
    let whoamiCallCount = 0;
    server.use(
      http.get('/api/whoami', () => {
        whoamiCallCount += 1;
        if (whoamiCallCount <= 2) {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/auth/refresh', () => {
        refreshCallCount += 1;
        return HttpResponse.json({ accessToken: 'new-token' });
      }),
    );

    await Promise.all([apiClient.get('/whoami'), apiClient.get('/whoami')]);

    expect(refreshCallCount).toBe(1);
  });

  it('on a failed refresh, clears the token, notifies subscribers, and rejects with the original 401', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionExpiry(listener);

    server.use(
      http.get('/api/whoami', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    setAccessToken('stale-token');
    let caught: unknown;
    try {
      await apiClient.get('/whoami');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    expect(listener).toHaveBeenCalledTimes(1);

    let receivedAuth: string | null | undefined;
    server.use(
      http.get('/api/whoami2', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiClient.get('/whoami2');
    expect(receivedAuth).toBeNull();

    unsubscribe();
  });

  it('delete resolves without throwing on a 204 No Content response', async () => {
    server.use(
      http.delete('/api/clubs/club-1/players/p1', () => new HttpResponse(null, { status: 204 })),
    );

    await expect(apiClient.delete('/clubs/club-1/players/p1')).resolves.toBeUndefined();
  });

  it('get resolves null on a 200 with an empty body', async () => {
    server.use(
      http.get('/api/clubs/club-1/guest-link', () => new HttpResponse(null, { status: 200 })),
    );

    await expect(apiClient.get('/clubs/club-1/guest-link')).resolves.toBeNull();
  });

  it('patch sends a JSON body and returns the parsed response', async () => {
    server.use(
      http.patch('/api/clubs/club-1/players/p1', async ({ request }) => {
        const body = (await request.json()) as { firstName: string };
        return HttpResponse.json({ ...body, id: 'p1' });
      }),
    );

    const result = await apiClient.patch<{ id: string; firstName: string }>(
      '/clubs/club-1/players/p1',
      { firstName: 'Updated' },
    );

    expect(result).toEqual({ id: 'p1', firstName: 'Updated' });
  });

  it('get() serializes params into the query string, skipping undefined and empty values', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/clubs/club-1/members', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 });
      }),
    );

    await apiClient.get('/clubs/club-1/members', {
      search: 'dup',
      page: 2,
      pageSize: undefined,
      role: '',
    });

    const url = new URL(receivedUrl);
    expect(url.searchParams.get('search')).toBe('dup');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('pageSize')).toBe(false);
    expect(url.searchParams.has('role')).toBe(false);
  });

  it('get() with no params hits the bare path', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/clubs/club-1/members', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 });
      }),
    );

    await apiClient.get('/clubs/club-1/members');

    expect(receivedUrl.endsWith('/api/clubs/club-1/members')).toBe(true);
  });

  it('ApiError carries the server-provided message from the response body', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    let caught: unknown;
    try {
      await apiClient.post('/auth/login', { email: 'a@b.com', password: 'wrong' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).message).toBe('Invalid credentials');
  });

  describe('during a read-only impersonation', () => {
    afterEach(() => {
      setImpersonationToken(null);
      setPlatformToken(null);
    });

    it('sends the impersonation token on product calls and the admin credentials on /admin/', async () => {
      const seen: Record<string, string | null> = {};
      server.use(
        http.get('/api/me/teams', ({ request }) => {
          seen.product = request.headers.get('Authorization');
          return HttpResponse.json([]);
        }),
        http.post('/api/admin/impersonations/s-1/end', ({ request }) => {
          seen.admin = request.headers.get('Authorization');
          seen.platform = request.headers.get('x-platform-token');
          return new HttpResponse(null, { status: 204 });
        }),
      );
      setAccessToken('admin-access');
      setPlatformToken('step-up');
      setImpersonationToken('impersonation');

      await apiClient.get('/me/teams');
      await apiClient.post('/admin/impersonations/s-1/end');

      expect(seen).toEqual({
        product: 'Bearer impersonation',
        admin: 'Bearer admin-access',
        platform: 'step-up',
      });
    });

    it('refuses a product write locally, without a request', async () => {
      const onRequest = vi.fn();
      server.events.on('request:start', onRequest);
      setImpersonationToken('impersonation');

      const err = await apiClient.post('/auth/logout').catch((e: unknown) => e);

      server.events.removeListener('request:start', onRequest);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe(IMPERSONATION_READ_ONLY_CODE);
      expect(onRequest).not.toHaveBeenCalled();
    });

    it('on a 401 never refreshes: it reports the impersonation as over', async () => {
      let refreshed = false;
      server.use(
        http.get('/api/me/teams', () => HttpResponse.json({}, { status: 401 })),
        http.post('/api/auth/refresh', () => {
          refreshed = true;
          return HttpResponse.json({ accessToken: 'new' });
        }),
      );
      const onImpersonationExpiry = vi.fn();
      const onSessionExpiry = vi.fn();
      const unsubscribe = subscribeToImpersonationExpiry(onImpersonationExpiry);
      const unsubscribeSession = subscribeToSessionExpiry(onSessionExpiry);
      setImpersonationToken('impersonation');

      await expect(apiClient.get('/me/teams')).rejects.toBeInstanceOf(ApiError);

      unsubscribe();
      unsubscribeSession();
      expect(refreshed).toBe(false);
      expect(onImpersonationExpiry).toHaveBeenCalledTimes(1);
      expect(onSessionExpiry).not.toHaveBeenCalled();
    });
  });
});
