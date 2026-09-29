import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { GuestLinkGuard } from './guest-link.guard';
import { GuestLinksService } from './guest-links.service';
import { GuestRateLimiter } from './guest-rate-limiter';
import { GuestRsvpController } from './guest-rsvp.controller';
import { GuestRsvpService } from './guest-rsvp.service';
import { TeamGuestLinkController } from './team-guest-link.controller';

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule, MeetingPointsModule],
  controllers: [TeamGuestLinkController, GuestRsvpController],
  providers: [GuestLinksService, GuestRsvpService, GuestRateLimiter, GuestLinkGuard],
})
export class GuestLinksModule {}
