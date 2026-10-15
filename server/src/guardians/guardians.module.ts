import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ClubPlayerGuardiansController } from './club-player-guardians.controller';
import { GuardianInvitesController } from './guardian-invites.controller';
import { MyGuardiansController } from './my-guardians.controller';
import { GuardiansService } from './guardians.service';
import { MyGuardiansService } from './my-guardians.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ClubPlayerGuardiansController, GuardianInvitesController, MyGuardiansController],
  providers: [GuardiansService, MyGuardiansService],
})
export class GuardiansModule {}
