import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Its own module rather than a helper inside RetentionModule: the AuditLog
// table is *swept* by retention but *written* by auth, and making retention
// own the writer would force RetentionModule to be imported by AuthModule,
// inverting the dependency (retention already reads auth's tables, not the
// other way round).
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
