import { IsOptional, IsUUID } from 'class-validator';
import type { ActingAsParams } from '@basketeasy/types/guardians';

/**
 * `?forPlayerId=`, on every route that has a « me ». Validated as a UUID
 * here; whether the caller may act for that player is decided in the service
 * (resolveActingTeamPlayer / assertCanActForPlayer), never trusted from here.
 */
export class ActingAsQueryDto implements ActingAsParams {
  @IsOptional()
  @IsUUID()
  forPlayerId?: string;
}
