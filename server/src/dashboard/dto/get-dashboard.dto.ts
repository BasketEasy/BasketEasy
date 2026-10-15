import { IsISO8601, IsOptional } from 'class-validator';
import type { GetDashboardParams } from '@basketeasy/types/my-dashboard';
import { ActingAsQueryDto } from '../../common/dto/acting-as-query.dto';

export class GetDashboardDto extends ActingAsQueryDto implements GetDashboardParams {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
