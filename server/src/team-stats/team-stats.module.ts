import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamStatsController } from './team-stats.controller';
import { TeamStatsService } from './team-stats.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamStatsController],
  providers: [TeamStatsService],
})
export class TeamStatsModule {}
