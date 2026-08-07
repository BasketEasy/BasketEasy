import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({
      status: 'ok',
      info: { database: { status: 'up' } },
      details: { database: { status: 'up' } },
    }),
  ),
];
