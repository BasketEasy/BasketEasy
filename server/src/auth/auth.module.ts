import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountSecurityService } from './account-security.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ClubRolesGuard } from './guards/club-roles.guard';
import { TeamManagerGuard } from './guards/team-manager.guard';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { LastActiveInterceptor } from './last-active.interceptor';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountSecurityService,
    JwtStrategy,
    JwtAuthGuard,
    ClubRolesGuard,
    TeamManagerGuard,
    EmailVerifiedGuard,
    PlatformAdminGuard,
    // Global (not route-scoped): "any authenticated request is activity" is
    // the rule, and a list of routes to apply it to would go stale the first
    // time one is added.
    { provide: APP_INTERCEPTOR, useClass: LastActiveInterceptor },
  ],
  exports: [
    AuthService,
    AccountSecurityService,
    JwtAuthGuard,
    ClubRolesGuard,
    TeamManagerGuard,
    EmailVerifiedGuard,
    PlatformAdminGuard,
  ],
})
export class AuthModule {}
