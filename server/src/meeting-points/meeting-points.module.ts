import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GeocodingService } from './geocoding.service';
import { MeetingPointsController } from './meeting-points.controller';
import { MeetingPointsService } from './meeting-points.service';
import { MeetingTravelProcessor } from './meeting-travel.processor';
import { NullRoutingClient } from './null-routing.client';
import { OrsRoutingClient } from './ors-routing.client';
import { ROUTING_CLIENT, type RoutingClient } from './routing-client';

@Module({
  imports: [AuthModule, QueueModule, NotificationsModule],
  controllers: [MeetingPointsController],
  providers: [
    MeetingPointsService,
    GeocodingService,
    MeetingTravelProcessor,
    OrsRoutingClient,
    NullRoutingClient,
    // The routing provider swap point — see routing-client.ts. Same shape as
    // MailModule's factory: with an ORS_API_KEY the real client is bound,
    // without one every lookup answers "unknown" and managers type travel
    // minutes by hand. Deliberately NOT boot-validated in
    // AppModule.validateEnv, same policy as GEMINI_API_KEY and BREVO_API_KEY.
    {
      provide: ROUTING_CLIENT,
      inject: [ConfigService, OrsRoutingClient, NullRoutingClient],
      useFactory: (
        config: ConfigService,
        ors: OrsRoutingClient,
        none: NullRoutingClient,
      ): RoutingClient => (config.get<string>('ORS_API_KEY') ? ors : none),
    },
  ],
  exports: [MeetingPointsService],
})
export class MeetingPointsModule {}
