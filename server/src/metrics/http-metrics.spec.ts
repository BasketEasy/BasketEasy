import type { Request, Response } from 'express';
import { metricsHandler } from './http-metrics';

function fakeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    end: jest.fn(),
  };
  return res as unknown as Response & typeof res;
}

function fakeReq(authorization?: string) {
  return {
    get: (name: string) => (name === 'authorization' ? authorization : undefined),
  } as Request;
}

describe('metricsHandler', () => {
  afterEach(() => {
    delete process.env.METRICS_TOKEN;
  });

  it('serves the metrics when no METRICS_TOKEN is configured', async () => {
    const res = fakeRes();

    await metricsHandler(fakeReq(), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('http_request_duration_seconds'));
  });

  it('refuses a missing or wrong bearer token when METRICS_TOKEN is set', async () => {
    process.env.METRICS_TOKEN = 'scrape-secret';

    for (const header of [undefined, 'Bearer nope', 'scrape-secret']) {
      const res = fakeRes();
      await metricsHandler(fakeReq(header), res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.end).toHaveBeenCalledWith();
    }
  });

  it('serves the metrics with the right bearer token', async () => {
    process.env.METRICS_TOKEN = 'scrape-secret';
    const res = fakeRes();

    await metricsHandler(fakeReq('Bearer scrape-secret'), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('http_request_duration_seconds'));
  });
});
