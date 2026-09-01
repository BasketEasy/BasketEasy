import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ScoresheetsModule } from '../scoresheets/scoresheets.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule, StorageModule, ScoresheetsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
