import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RetentionModule } from '../retention/retention.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminBrowseController } from './platform-admin-browse.controller';
import { PlatformAdminBrowseService } from './platform-admin-browse.service';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [AuthModule, AuditModule, RetentionModule, JwtModule.register({})],
  controllers: [PlatformAdminController, PlatformAdminBrowseController],
  providers: [PlatformAdminService, PlatformAdminBrowseService],
})
export class PlatformAdminModule {}
