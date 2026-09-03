import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClubsModule } from './clubs/clubs.module';
import { TeamsModule } from './teams/teams.module';
import { EventsModule } from './events/events.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StorageModule } from './storage/storage.module';
import { ScoresheetsModule } from './scoresheets/scoresheets.module';
import { TeamStatsModule } from './team-stats/team-stats.module';
import { InvitesModule } from './invites/invites.module';

// Minimum acceptable length for JWT_ACCESS_SECRET. 32 chars gives an HMAC-SHA256
// signature a reasonable amount of entropy to resist brute force; this is a
// floor, not a recommendation — deployments should use a properly random secret.
const MIN_JWT_ACCESS_SECRET_LENGTH = 32;

// No schema-validation library (Joi/zod) is a server dependency yet, so this
// uses ConfigModule's own `validate` hook instead of pulling one in just for
// a single required var. Revisit with a real schema (Joi/zod) once more env
// vars land and hand-rolled checks stop scaling.
function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const secret = config.JWT_ACCESS_SECRET;
  if (typeof secret !== 'string' || secret.trim().length < MIN_JWT_ACCESS_SECRET_LENGTH) {
    throw new Error(
      `JWT_ACCESS_SECRET must be set to a string of at least ${MIN_JWT_ACCESS_SECRET_LENGTH} characters. ` +
        'A missing or weak secret makes HMAC-signed access tokens forgeable.',
    );
  }
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClubsModule,
    TeamsModule,
    EventsModule,
    DashboardModule,
    StorageModule,
    ScoresheetsModule,
    TeamStatsModule,
    InvitesModule,
  ],
})
export class AppModule {}
