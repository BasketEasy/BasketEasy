import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';

collectDefaultMetrics(); // RAM, heap, event loop Node (filtrés côté Alloy, §4)

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP par route',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.3, 1, 3], // peu de buckets = peu de séries = coût maîtrisé
});

const httpResponses = new Counter({
  name: 'http_responses_total',
  help: 'Réponses HTTP par classe de statut',
  labelNames: ['status_class'],
});

const httpErrors = new Counter({
  name: 'http_errors_total',
  help: 'Réponses 5xx par route',
  labelNames: ['method', 'route'],
});

export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/metrics') return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    // req.route n'est rempli que si une route Nest a matché ; sinon 404 de bot, scan, etc.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const method = req.method;
    end({ method, route });
    httpResponses.inc({ status_class: `${Math.floor(res.statusCode / 100)}xx` });
    if (res.statusCode >= 500) httpErrors.inc({ method, route });
  });
  next();
}

// With METRICS_TOKEN set, the scraper (Grafana Alloy) must send it as a bearer
// token; unset, /metrics stays open and relies on the port not being published.
// Read per request so a test or a restart-free secret rotation sees the change.
function isAuthorized(req: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return true;
  const header = req.get('authorization') ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function metricsHandler(req: Request, res: Response) {
  if (!isAuthorized(req)) {
    res.status(401).set('WWW-Authenticate', 'Bearer').end();
    return;
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
