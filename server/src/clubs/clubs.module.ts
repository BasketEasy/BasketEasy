import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [AuthModule],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
