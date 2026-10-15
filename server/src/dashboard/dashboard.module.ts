import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeetingPointsModule } from '../meeting-points/meeting-points.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, MeetingPointsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
