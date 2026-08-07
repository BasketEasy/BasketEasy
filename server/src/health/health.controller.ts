import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthResponse } from '@basketeasy/types';

/**
 * GET /api/health
 *
 * Liveness/readiness probe consumed by the frontend landing page, Docker
 * healthchecks, and (later) uptime monitoring. Kept dependency-free for now
 * (no DB/Redis indicators yet) — see docs/backend-stack.md for the plan to
 * wire in Postgres/Redis indicators via @nestjs/terminus as those land.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  @Get('ping')
  ping(): HealthResponse {
    return {
      status: 'ok',
      service: 'basketeasy-api',
      timestamp: new Date().toISOString(),
    };
  }
}
