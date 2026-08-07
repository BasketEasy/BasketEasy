import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import type { HealthResponse } from '@basketeasy/types/health';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GET /api/health
 *
 * Liveness/readiness probe consumed by the frontend landing page, Docker
 * healthchecks, and (later) uptime monitoring. Includes a Prisma-backed
 * database ping. /health/ping stays dependency-free for pure liveness.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prismaHealth.pingCheck('database', this.prisma)]);
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
