import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { DEFAULT_HEALTH_CHECK_URL, recordHealthCheck, runHealthCheck } from './index';

type WorkerEnv = Parameters<typeof runHealthCheck>[0];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(impl: () => Promise<Response>) {
  const spy = vi.fn(impl);
  // Assigné après le setup MSW, qui patche lui aussi globalThis.fetch : le
  // Worker n'appelle pas l'API du front, il tape une URL externe qu'aucun
  // handler MSW ne couvre.
  vi.stubGlobal('fetch', spy);
  return spy;
}

function envWithDataset() {
  const writeDataPoint = vi.fn();
  return {
    env: { HEALTH_AE: { writeDataPoint } } as unknown as WorkerEnv,
    writeDataPoint,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runHealthCheck', () => {
  it('reports an API answering 200 as healthy, keeping its Terminus status', async () => {
    const fetchSpy = stubFetch(async () => jsonResponse({ status: 'ok' }));

    const result = await runHealthCheck({} as WorkerEnv);

    expect(fetchSpy).toHaveBeenCalledWith(DEFAULT_HEALTH_CHECK_URL, expect.anything());
    expect(result.healthy).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.detail).toBe('ok');
  });

  it('targets the configured URL when one is set', async () => {
    const fetchSpy = stubFetch(async () => jsonResponse({ status: 'ok' }));

    await runHealthCheck({ HEALTH_CHECK_URL: 'https://staging.example/api/health' } as WorkerEnv);

    expect(fetchSpy).toHaveBeenCalledWith('https://staging.example/api/health', expect.anything());
  });

  it('reports a non-2xx response as unhealthy', async () => {
    stubFetch(async () => new Response('<html>bad gateway</html>', { status: 502 }));

    const result = await runHealthCheck({} as WorkerEnv);

    expect(result.healthy).toBe(false);
    expect(result.httpStatus).toBe(502);
    // Le corps n'est pas du JSON : pas de statut Terminus à en tirer, et ce
    // n'est pas une erreur en soi.
    expect(result.detail).toBe('');
  });

  it('reports a failed request as unhealthy with the error as detail', async () => {
    stubFetch(async () => {
      throw new Error('The operation was aborted due to timeout');
    });

    const result = await runHealthCheck({} as WorkerEnv);

    expect(result.healthy).toBe(false);
    expect(result.httpStatus).toBe(0);
    expect(result.detail).toBe('The operation was aborted due to timeout');
  });
});

describe('recordHealthCheck', () => {
  it('writes one data point per check', () => {
    const { env, writeDataPoint } = envWithDataset();

    recordHealthCheck(env, { healthy: false, httpStatus: 503, latencyMs: 42, detail: 'error' });

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['api'],
      blobs: ['down', '503', 'error'],
      doubles: [0, 42],
    });
  });

  it('is a no-op when no Analytics Engine dataset is bound', () => {
    expect(() =>
      recordHealthCheck({} as WorkerEnv, {
        healthy: true,
        httpStatus: 200,
        latencyMs: 12,
        detail: 'ok',
      }),
    ).not.toThrow();
  });
});

describe('scheduled', () => {
  it('records the outcome of each run', async () => {
    stubFetch(async () => jsonResponse({ status: 'ok' }));
    const { env, writeDataPoint } = envWithDataset();

    await worker.scheduled(null, env);

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint.mock.calls[0][0]).toMatchObject({
      blobs: expect.arrayContaining(['up']),
    });
  });

  it('logs a failing check', async () => {
    stubFetch(async () => jsonResponse({ status: 'error' }, 503));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env } = envWithDataset();

    await worker.scheduled(null, env);

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('503'));
  });
});

describe('fetch', () => {
  it('delegates every non-asset request to the static assets binding', async () => {
    const assetResponse = new Response('<!doctype html>');
    const assets = { fetch: vi.fn(async () => assetResponse) };
    const request = new Request('https://kluvo.net/dashboard');

    const response = await worker.fetch(request, { ASSETS: assets } as unknown as WorkerEnv);

    expect(assets.fetch).toHaveBeenCalledWith(request);
    expect(response).toBe(assetResponse);
  });
});
