import { Module } from '@nestjs/common';
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
