export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
}

/** A single indicator's result within a Terminus health check (e.g. the "database" entry). */
export interface HealthIndicatorResult {
  status: 'up' | 'down';
  /** Present on failure — e.g. "timeout of 1000ms exceeded". */
  message?: string;
}

/** Shape returned by Terminus's HealthCheckService.check() on GET /api/health. */
export interface HealthCheckResponse {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, HealthIndicatorResult>;
  error?: Record<string, HealthIndicatorResult>;
  details: Record<string, HealthIndicatorResult>;
}
