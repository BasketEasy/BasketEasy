import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FfbbModule } from '../ffbb/ffbb.module';
import { TeamsController } from './teams.controller';
import { MyTeamsController } from './my-teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [AuthModule, FfbbModule],
  controllers: [TeamsController, MyTeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
