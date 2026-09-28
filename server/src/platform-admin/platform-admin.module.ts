import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RetentionModule } from '../retention/retention.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminBrowseController } from './platform-admin-browse.controller';
import { PlatformAdminBrowseService } from './platform-admin-browse.service';
import { PlatformAdminSearchService } from './platform-admin-search.service';
import { PlatformAdminStatsService } from './platform-admin-stats.service';
import { PlatformAdminActionsController } from './platform-admin-actions.controller';
import { PlatformAdminActionsService } from './platform-admin-actions.service';
import { ScoresheetsModule } from '../scoresheets/scoresheets.module';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [AuthModule, AuditModule, RetentionModule, ScoresheetsModule, JwtModule.register({})],
  controllers: [
    PlatformAdminController,
    PlatformAdminBrowseController,
    PlatformAdminActionsController,
  ],
  providers: [
    PlatformAdminService,
    PlatformAdminBrowseService,
    PlatformAdminSearchService,
    PlatformAdminStatsService,
    PlatformAdminActionsService,
  ],
})
export class PlatformAdminModule {}
